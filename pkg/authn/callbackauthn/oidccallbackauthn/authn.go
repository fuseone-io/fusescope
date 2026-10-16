// Package oidccallbackauthn implements single sign-on against any OpenID Connect
// provider (Microsoft Entra ID, Keycloak, Okta, Auth0, …). It is a clean-room
// implementation written against pkg/authn and the public OpenID Connect specs.
package oidccallbackauthn

import (
	"context"
	"log/slog"
	"net/url"
	"path"
	"slices"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/http/client"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const redirectPath string = "/api/v1/complete/oidc"

var defaultScopes = []string{oidc.ScopeOpenID, "email", "profile"}

var _ authn.CallbackAuthN = (*AuthN)(nil)

type AuthN struct {
	store        authtypes.AuthNStore
	settings     factory.ScopedProviderSettings
	httpClient   *client.Client
	globalConfig global.Config
}

func New(ctx context.Context, store authtypes.AuthNStore, providerSettings factory.ProviderSettings, globalConfig global.Config) (*AuthN, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/oidccallbackauthn")

	httpClient, err := client.New(settings.Logger(), providerSettings.TracerProvider, providerSettings.MeterProvider)
	if err != nil {
		return nil, err
	}

	return &AuthN{
		store:        store,
		settings:     settings,
		httpClient:   httpClient,
		globalConfig: globalConfig,
	}, nil
}

func (a *AuthN) LoginURL(ctx context.Context, siteURL *url.URL, authDomain *authtypes.AuthDomain) (string, error) {
	oidcConfig, err := authDomain.Config().OIDCConfig()
	if err != nil {
		return "", err
	}

	provider, err := a.provider(ctx, oidcConfig)
	if err != nil {
		return "", err
	}

	return a.oauth2Config(siteURL, oidcConfig, provider).AuthCodeURL(authtypes.NewState(siteURL, authDomain.StorableAuthDomain().ID).URL.String()), nil
}

func (a *AuthN) HandleCallback(ctx context.Context, query url.Values) (*authtypes.CallbackIdentity, error) {
	if providerErr := query.Get("error"); providerErr != "" {
		a.settings.Logger().ErrorContext(ctx, "oidc: error while authenticating", slog.String("error", providerErr), slog.String("error_description", query.Get("error_description")))
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: error while authenticating").WithAdditional(query.Get("error_description"))
	}

	state, err := authtypes.NewStateFromString(query.Get("state"))
	if err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeInvalidState, "oidc: invalid state").WithAdditional(err.Error())
	}

	authDomain, err := a.store.GetAuthDomainFromID(ctx, state.DomainID)
	if err != nil {
		return nil, err
	}

	oidcConfig, err := authDomain.Config().OIDCConfig()
	if err != nil {
		return nil, err
	}

	provider, err := a.provider(ctx, oidcConfig)
	if err != nil {
		return nil, err
	}

	token, err := a.oauth2Config(state.URL, oidcConfig, provider).Exchange(a.clientContext(ctx), query.Get("code"))
	if err != nil {
		var retrieveError *oauth2.RetrieveError
		if errors.As(err, &retrieveError) {
			a.settings.Logger().ErrorContext(ctx, "oidc: failed to get token", errors.Attr(err), slog.String("error_description", retrieveError.ErrorDescription))
			return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: failed to get token").WithAdditional(retrieveError.ErrorDescription)
		}

		a.settings.Logger().ErrorContext(ctx, "oidc: failed to get token", errors.Attr(err))
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "oidc: failed to get token")
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, errors.New(errors.TypeForbidden, errors.CodeForbidden, "oidc: no id_token in token response")
	}

	idToken, err := provider.Verifier(&oidc.Config{ClientID: oidcConfig.ClientID}).Verify(a.clientContext(ctx), rawIDToken)
	if err != nil {
		a.settings.Logger().ErrorContext(ctx, "oidc: failed to verify id_token", errors.Attr(err))
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: failed to verify id_token")
	}

	claims := map[string]any{}
	if err := idToken.Claims(&claims); err != nil {
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: invalid id_token claims").WithAdditional(err.Error())
	}

	if oidcConfig.GetUserInfo {
		if err := a.mergeUserInfo(ctx, provider, token, idToken.Subject, claims); err != nil {
			return nil, err
		}
	}

	return a.identityFromClaims(ctx, claims, oidcConfig, authDomain, state)
}

func (a *AuthN) ProviderInfo(_ context.Context, _ *authtypes.AuthDomain) *authtypes.AuthNProviderInfo {
	return &authtypes.AuthNProviderInfo{RelayStatePath: nil}
}

func (a *AuthN) identityFromClaims(ctx context.Context, claims map[string]any, oidcConfig authtypes.OIDCConfig, authDomain *authtypes.AuthDomain, state authtypes.State) (*authtypes.CallbackIdentity, error) {
	mapping := oidcConfig.ClaimMapping

	rawEmail := stringClaim(claims, mapping.Email)
	if rawEmail == "" {
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: the %q claim is missing", mapping.Email)
	}

	email, err := valuer.NewEmail(rawEmail)
	if err != nil {
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: invalid email").WithAdditional(err.Error())
	}

	if !oidcConfig.InsecureSkipEmailVerified && !boolClaim(claims, "email_verified") {
		a.settings.Logger().ErrorContext(ctx, "oidc: email is not verified", slog.String("email", email.String()))
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: email is not verified")
	}

	domainName := authDomain.StorableAuthDomain().Name
	if !strings.EqualFold(emailDomain(email.String()), domainName) {
		a.settings.Logger().ErrorContext(ctx, "oidc: email outside the auth domain", slog.String("email", email.String()), slog.String("domain", domainName))
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: email does not belong to %q", domainName)
	}

	return authtypes.NewCallbackIdentity(
		stringClaim(claims, mapping.Name),
		email,
		authDomain.StorableAuthDomain().OrgID,
		state,
		stringsClaim(claims, mapping.Groups),
		stringClaim(claims, mapping.Role),
	), nil
}

// mergeUserInfo adds userinfo claims the id_token does not carry. An unreachable
// or rejecting userinfo endpoint only loses the extra claims, so the login goes on
// with the verified id_token; a userinfo subject that differs from the id_token
// subject is rejected (OpenID Connect Core §5.3.2).
func (a *AuthN) mergeUserInfo(ctx context.Context, provider *oidc.Provider, token *oauth2.Token, subject string, claims map[string]any) error {
	userInfo, err := provider.UserInfo(a.clientContext(ctx), oauth2.StaticTokenSource(token))
	if err != nil {
		a.settings.Logger().WarnContext(ctx, "oidc: failed to fetch userinfo, using id_token claims only", errors.Attr(err))
		return nil
	}

	if userInfo.Subject != subject {
		return errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: userinfo subject does not match the id_token")
	}

	userInfoClaims := map[string]any{}
	if err := userInfo.Claims(&userInfoClaims); err != nil {
		return errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "oidc: invalid userinfo claims").WithAdditional(err.Error())
	}

	for key, value := range userInfoClaims {
		if _, ok := claims[key]; !ok {
			claims[key] = value
		}
	}

	return nil
}

// provider discovers the OpenID configuration from the issuer URL. When an alias
// is set (Entra ID multi-tenant, IdPs behind internal hostnames) discovery still
// uses the issuer URL but tokens are validated against the alias.
func (a *AuthN) provider(ctx context.Context, oidcConfig authtypes.OIDCConfig) (*oidc.Provider, error) {
	discoveryCtx := a.clientContext(ctx)
	if oidcConfig.IssuerAlias != "" {
		discoveryCtx = oidc.InsecureIssuerURLContext(discoveryCtx, oidcConfig.IssuerAlias)
	}

	provider, err := oidc.NewProvider(discoveryCtx, oidcConfig.Issuer)
	if err != nil {
		a.settings.Logger().ErrorContext(ctx, "oidc: discovery failed", errors.Attr(err), slog.String("issuer", oidcConfig.Issuer))
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "oidc: discovery failed for issuer %q", oidcConfig.Issuer).WithAdditional(err.Error())
	}

	return provider, nil
}

func (a *AuthN) clientContext(ctx context.Context) context.Context {
	return oidc.ClientContext(ctx, a.httpClient.Client())
}

func (a *AuthN) oauth2Config(siteURL *url.URL, oidcConfig authtypes.OIDCConfig, provider *oidc.Provider) *oauth2.Config {
	scopes := slices.Clone(defaultScopes)
	for _, scope := range oidcConfig.Scopes {
		if !slices.Contains(scopes, scope) {
			scopes = append(scopes, scope)
		}
	}

	return &oauth2.Config{
		ClientID:     oidcConfig.ClientID,
		ClientSecret: oidcConfig.ClientSecret,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
		RedirectURL: (&url.URL{
			Scheme: siteURL.Scheme,
			Host:   siteURL.Host,
			Path:   path.Join(a.globalConfig.ExternalPath(), redirectPath),
		}).String(),
	}
}

func emailDomain(email string) string {
	if at := strings.LastIndexByte(email, '@'); at != -1 {
		return email[at+1:]
	}

	return ""
}

func stringClaim(claims map[string]any, key string) string {
	if value, ok := claims[key].(string); ok {
		return value
	}

	return ""
}

// boolClaim accepts JSON booleans and the "true"/"false" strings some IdPs send.
func boolClaim(claims map[string]any, key string) bool {
	switch value := claims[key].(type) {
	case bool:
		return value
	case string:
		return strings.EqualFold(value, "true")
	}

	return false
}

// stringsClaim accepts a JSON array of strings or a single string.
func stringsClaim(claims map[string]any, key string) []string {
	switch value := claims[key].(type) {
	case string:
		return []string{value}
	case []any:
		values := make([]string, 0, len(value))
		for _, item := range value {
			if s, ok := item.(string); ok {
				values = append(values, s)
			}
		}

		return values
	}

	return nil
}
