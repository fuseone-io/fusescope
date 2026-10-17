// Package samlcallbackauthn implements single sign-on against SAML 2.0 identity
// providers. It is a clean-room implementation written against pkg/authn and the
// OASIS SAML 2.0 specifications.
package samlcallbackauthn

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"log/slog"
	"net/url"
	"path"
	"strings"
	"time"

	saml2 "github.com/russellhaering/gosaml2"
	dsig "github.com/russellhaering/goxmldsig"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const redirectPath string = "/api/v1/complete/saml"

// replayWindow bounds how long a consumed assertion ID is remembered when the
// assertion carries no usable NotOnOrAfter.
const replayWindow = 10 * time.Minute

var _ authn.CallbackAuthN = (*AuthN)(nil)

type AuthN struct {
	store        authtypes.AuthNStore
	settings     factory.ScopedProviderSettings
	globalConfig global.Config
	cache        cache.Cache
}

func New(_ context.Context, store authtypes.AuthNStore, providerSettings factory.ProviderSettings, globalConfig global.Config, cache cache.Cache) (*AuthN, error) {
	return &AuthN{
		store:        store,
		settings:     factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/samlcallbackauthn"),
		globalConfig: globalConfig,
		cache:        cache,
	}, nil
}

// LoginURL starts SP-initiated login with the HTTP-Redirect binding. Requests are
// sent unsigned; the security of the exchange rests on the IdP-signed response.
func (a *AuthN) LoginURL(ctx context.Context, siteURL *url.URL, authDomain *authtypes.AuthDomain) (string, error) {
	samlConfig, err := authDomain.Config().SamlConfig()
	if err != nil {
		return "", err
	}

	if err := a.trustServiceProviderURL(ctx, siteURL); err != nil {
		return "", err
	}

	sp, err := a.serviceProvider(siteURL, samlConfig)
	if err != nil {
		return "", err
	}

	doc, err := sp.BuildAuthRequestDocument()
	if err != nil {
		return "", errors.Newf(errors.TypeInternal, errors.CodeInternal, "saml: failed to build the authn request").WithAdditional(err.Error())
	}

	loginURL, err := sp.BuildAuthURLRedirect(authtypes.NewState(siteURL, authDomain.StorableAuthDomain().ID).URL.String(), doc)
	if err != nil {
		return "", errors.Newf(errors.TypeInternal, errors.CodeInternal, "saml: failed to build the login url").WithAdditional(err.Error())
	}

	return loginURL, nil
}

func (a *AuthN) HandleCallback(ctx context.Context, values url.Values) (*authtypes.CallbackIdentity, error) {
	encodedResponse := values.Get("SAMLResponse")
	if encodedResponse == "" {
		return nil, errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "saml: missing SAMLResponse")
	}

	state, err := authtypes.NewStateFromString(values.Get("RelayState"))
	if err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeInvalidState, "saml: invalid relay state").WithAdditional(err.Error())
	}

	authDomain, err := a.store.GetAuthDomainFromID(ctx, state.DomainID)
	if err != nil {
		return nil, err
	}

	samlConfig, err := authDomain.Config().SamlConfig()
	if err != nil {
		return nil, err
	}

	if err := a.trustServiceProviderURL(ctx, state.URL); err != nil {
		return nil, err
	}

	sp, err := a.serviceProvider(state.URL, samlConfig)
	if err != nil {
		return nil, err
	}

	assertionInfo, err := sp.RetrieveAssertionInfo(encodedResponse)
	if err != nil {
		a.settings.Logger().ErrorContext(ctx, "saml: invalid response", errors.Attr(err))
		return nil, errors.New(errors.TypeForbidden, errors.CodeForbidden, "saml: invalid response")
	}

	if err := a.validateAssertion(ctx, authDomain.StorableAuthDomain().OrgID, assertionInfo); err != nil {
		return nil, err
	}

	return a.identityFromAssertion(ctx, assertionInfo, samlConfig, authDomain, state)
}

// ProviderInfo exposes the relay state an IdP-initiated login must carry so the
// callback can find the auth domain. The path is relative to the site root.
func (a *AuthN) ProviderInfo(_ context.Context, authDomain *authtypes.AuthDomain) *authtypes.AuthNProviderInfo {
	relayState := authtypes.NewState(&url.URL{Path: a.globalConfig.ExternalPath()}, authDomain.StorableAuthDomain().ID).URL.String()
	relayStatePath := strings.TrimPrefix(relayState, "/")

	return &authtypes.AuthNProviderInfo{RelayStatePath: &relayStatePath}
}

// validateAssertion rejects what gosaml2 only reports as warnings, and assertions
// already consumed. The replay check is per cache: shared with the redis cache,
// per process with the memory cache.
func (a *AuthN) validateAssertion(ctx context.Context, orgID valuer.UUID, assertionInfo *saml2.AssertionInfo) error {
	if assertionInfo.WarningInfo.InvalidTime {
		return errors.New(errors.TypeForbidden, errors.CodeForbidden, "saml: assertion is expired or not yet valid")
	}

	if assertionInfo.WarningInfo.NotInAudience {
		return errors.New(errors.TypeForbidden, errors.CodeForbidden, "saml: assertion is not addressed to this service provider")
	}

	if len(assertionInfo.Assertions) == 0 || assertionInfo.Assertions[0].ID == "" {
		return errors.New(errors.TypeForbidden, errors.CodeForbidden, "saml: assertion has no ID")
	}

	assertion := assertionInfo.Assertions[0]
	key := "saml:assertion:" + assertion.ID
	if err := a.cache.Get(ctx, orgID, key, new(consumedAssertion)); err == nil {
		a.settings.Logger().WarnContext(ctx, "saml: replayed assertion", slog.String("assertion_id", assertion.ID))
		return errors.New(errors.TypeForbidden, errors.CodeForbidden, "saml: assertion was already used")
	}

	ttl := replayWindow
	if assertion.Conditions != nil {
		if notOnOrAfter, err := time.Parse(time.RFC3339, assertion.Conditions.NotOnOrAfter); err == nil && time.Until(notOnOrAfter) > 0 {
			ttl = time.Until(notOnOrAfter)
		}
	}

	if err := a.cache.Set(ctx, orgID, key, &consumedAssertion{}, ttl); err != nil {
		a.settings.Logger().ErrorContext(ctx, "saml: failed to record assertion", errors.Attr(err))
		return errors.New(errors.TypeInternal, errors.CodeInternal, "saml: failed to record assertion")
	}

	return nil
}

func (a *AuthN) identityFromAssertion(ctx context.Context, assertionInfo *saml2.AssertionInfo, samlConfig authtypes.SamlConfig, authDomain *authtypes.AuthDomain, state authtypes.State) (*authtypes.CallbackIdentity, error) {
	mapping := samlConfig.AttributeMapping

	rawEmail := firstValue(attributeValues(assertionInfo.Values, mapping.Email))
	if rawEmail == "" {
		rawEmail = assertionInfo.NameID
	}

	email, err := valuer.NewEmail(rawEmail)
	if err != nil {
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "saml: no valid email in the %q attribute or the NameID", mapping.Email)
	}

	domainName := authDomain.StorableAuthDomain().Name
	if !strings.EqualFold(emailDomain(email.String()), domainName) {
		a.settings.Logger().ErrorContext(ctx, "saml: email outside the auth domain", slog.String("email", email.String()), slog.String("domain", domainName))
		return nil, errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "saml: email does not belong to %q", domainName)
	}

	return authtypes.NewCallbackIdentity(
		firstValue(attributeValues(assertionInfo.Values, mapping.Name)),
		email,
		authDomain.StorableAuthDomain().OrgID,
		state,
		attributeValues(assertionInfo.Values, mapping.Groups),
		firstValue(attributeValues(assertionInfo.Values, mapping.Role)),
	), nil
}

// trustServiceProviderURL rejects a request URL whose host is not this deployment's.
// The SP identity (entity ID, audience, ACS) is derived from it and the relay state
// is client input, so it must match the hostname of global.external_url, or one of
// global.allowed_origins. With neither configured it is used as is.
func (a *AuthN) trustServiceProviderURL(ctx context.Context, requestURL *url.URL) error {
	if externalURL := a.globalConfig.ExternalURL; externalURL != nil && externalURL.Host != "" && externalURL.Host != "<unset>" {
		if !strings.EqualFold(requestURL.Hostname(), externalURL.Hostname()) {
			return errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "saml: host %q does not match the external url", requestURL.Host)
		}

		return nil
	}

	if len(a.globalConfig.AllowedOrigins) > 0 {
		if !a.globalConfig.IsOriginAllowed(requestURL) {
			return errors.Newf(errors.TypeForbidden, errors.CodeForbidden, "saml: host %q is not an allowed origin", requestURL.Host)
		}

		return nil
	}

	a.settings.Logger().WarnContext(ctx, "saml: neither global.external_url nor global.allowed_origins is set, so the service provider identity comes from the relay state")
	return nil
}

func (a *AuthN) serviceProvider(siteURL *url.URL, samlConfig authtypes.SamlConfig) (*saml2.SAMLServiceProvider, error) {
	certificate, err := parseCertificate(samlConfig.Certificate)
	if err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "saml: invalid identity provider certificate").WithAdditional(err.Error())
	}

	return &saml2.SAMLServiceProvider{
		IdentityProviderSSOURL:     samlConfig.Location,
		IdentityProviderSSOBinding: saml2.BindingHttpRedirect,
		IdentityProviderIssuer:     samlConfig.EntityID,
		ServiceProviderIssuer:      siteURL.Host,
		AudienceURI:                siteURL.Host,
		AssertionConsumerServiceURL: (&url.URL{
			Scheme: siteURL.Scheme,
			Host:   siteURL.Host,
			Path:   path.Join(a.globalConfig.ExternalPath(), redirectPath),
		}).String(),
		IDPCertificateStore: &dsig.MemoryX509CertificateStore{Roots: []*x509.Certificate{certificate}},
	}, nil
}

// parseCertificate accepts the base64 body of an X509Certificate element or a PEM block.
func parseCertificate(raw string) (*x509.Certificate, error) {
	if block, _ := pem.Decode([]byte(strings.TrimSpace(raw))); block != nil {
		return x509.ParseCertificate(block.Bytes)
	}

	der, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(raw), ""))
	if err != nil {
		return nil, err
	}

	return x509.ParseCertificate(der)
}

// attributeValues matches the mapping key against the attribute Name or FriendlyName,
// since IdPs publish standard attributes under URNs (urn:oid:…) with a friendly name.
func attributeValues(values saml2.Values, key string) []string {
	if key == "" {
		return nil
	}

	for name, attribute := range values {
		if name != key && attribute.FriendlyName != key {
			continue
		}

		out := make([]string, 0, len(attribute.Values))
		for _, value := range attribute.Values {
			if value.Value != "" {
				out = append(out, value.Value)
			}
		}

		return out
	}

	return nil
}

func firstValue(values []string) string {
	if len(values) == 0 {
		return ""
	}

	return values[0]
}

func emailDomain(email string) string {
	if at := strings.LastIndexByte(email, '@'); at != -1 {
		return email[at+1:]
	}

	return ""
}

type consumedAssertion struct{}

func (consumedAssertion) MarshalBinary() ([]byte, error) { return []byte{1}, nil }

func (*consumedAssertion) UnmarshalBinary([]byte) error { return nil }
