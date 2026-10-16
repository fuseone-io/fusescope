package oidccallbackauthn

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes/authtypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	testClientID     = "fusescope"
	testClientSecret = "s3cret"
	testDomain       = "acme.test"
	testAuthCode     = "auth-code"
)

// fakeIdP is a minimal OpenID Connect provider: discovery, JWKS, token and userinfo endpoints.
type fakeIdP struct {
	server *httptest.Server
	key    *rsa.PrivateKey
	// advertisedIssuer is the issuer in discovery and tokens; defaults to the server URL.
	advertisedIssuer string
	idTokenClaims    map[string]any
	userInfoClaims   map[string]any
	userInfoStatus   int
	audience         string
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	idp := &fakeIdP{key: key, audience: testClientID}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{
			"issuer":                                idp.issuer(),
			"authorization_endpoint":                idp.server.URL + "/auth",
			"token_endpoint":                        idp.server.URL + "/token",
			"jwks_uri":                              idp.server.URL + "/keys",
			"userinfo_endpoint":                     idp.server.URL + "/userinfo",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		if r.Form.Get("code") != testAuthCode {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(t, w, map[string]any{"error": "invalid_grant", "error_description": "bad code"})
			return
		}

		writeJSON(t, w, map[string]any{
			"access_token": "access-token",
			"token_type":   "Bearer",
			"expires_in":   3600,
			"id_token":     idp.signIDToken(t),
		})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer access-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if idp.userInfoStatus != 0 {
			w.WriteHeader(idp.userInfoStatus)
			return
		}

		claims := map[string]any{"sub": "user-1"}
		for k, v := range idp.userInfoClaims {
			claims[k] = v
		}
		writeJSON(t, w, claims)
	})

	idp.server = httptest.NewServer(mux)
	t.Cleanup(idp.server.Close)

	return idp
}

func (idp *fakeIdP) issuer() string {
	if idp.advertisedIssuer != "" {
		return idp.advertisedIssuer
	}

	return idp.server.URL
}

func (idp *fakeIdP) signIDToken(t *testing.T) string {
	t.Helper()

	claims := map[string]any{
		"iss": idp.issuer(),
		"sub": "user-1",
		"aud": idp.audience,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	for k, v := range idp.idTokenClaims {
		claims[k] = v
	}

	payload, err := json.Marshal(claims)
	require.NoError(t, err)

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: idp.key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "k1"))
	require.NoError(t, err)

	signed, err := signer.Sign(payload)
	require.NoError(t, err)

	token, err := signed.CompactSerialize()
	require.NoError(t, err)

	return token
}

func writeJSON(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	require.NoError(t, json.NewEncoder(w).Encode(v))
}

func newAuthDomain(t *testing.T, spec map[string]any) *authtypes.AuthDomain {
	t.Helper()

	data, err := json.Marshal(map[string]any{
		"name":    testDomain,
		"enabled": true,
		"config":  map[string]any{"kind": "oidc", "spec": spec},
	})
	require.NoError(t, err)

	var postable authtypes.PostableAuthDomain
	require.NoError(t, json.Unmarshal(data, &postable))

	authDomain, err := authtypes.NewAuthDomainFromPostableAuthDomain(&postable, valuer.GenerateUUID())
	require.NoError(t, err)

	return authDomain
}

func baseSpec(idp *fakeIdP) map[string]any {
	return map[string]any{"issuer": idp.server.URL, "clientId": testClientID, "clientSecret": testClientSecret}
}

func newTestAuthN(t *testing.T, authDomain *authtypes.AuthDomain) *AuthN {
	t.Helper()

	store := authtypestest.NewMockAuthNStore(t)
	store.EXPECT().GetAuthDomainFromID(mock.Anything, mock.Anything).Return(authDomain, nil).Maybe()

	authN, err := New(context.Background(), store, instrumentationtest.New().ToProviderSettings(), global.Config{})
	require.NoError(t, err)

	return authN
}

var siteURL = &url.URL{Scheme: "https", Host: "fusescope.example.com", Path: "/login"}

func callbackQuery(t *testing.T, authDomain *authtypes.AuthDomain) url.Values {
	t.Helper()

	return url.Values{
		"code":  {testAuthCode},
		"state": {authtypes.NewState(siteURL, authDomain.StorableAuthDomain().ID).URL.String()},
	}
}

func TestLoginURL(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, baseSpec(idp))
	authN := newTestAuthN(t, authDomain)

	loginURL, err := authN.LoginURL(context.Background(), siteURL, authDomain)
	require.NoError(t, err)

	parsed, err := url.Parse(loginURL)
	require.NoError(t, err)

	assert.Equal(t, idp.server.URL+"/auth", parsed.Scheme+"://"+parsed.Host+parsed.Path)
	assert.Equal(t, testClientID, parsed.Query().Get("client_id"))
	assert.Equal(t, "code", parsed.Query().Get("response_type"))
	assert.Equal(t, "https://fusescope.example.com/api/v1/complete/oidc", parsed.Query().Get("redirect_uri"))
	assert.Subset(t, strings.Fields(parsed.Query().Get("scope")), []string{"openid", "email", "profile"})

	state, err := authtypes.NewStateFromString(parsed.Query().Get("state"))
	require.NoError(t, err)
	assert.Equal(t, authDomain.StorableAuthDomain().ID, state.DomainID)
}

func TestLoginURL_AdditionalScopes(t *testing.T) {
	idp := newFakeIdP(t)
	spec := baseSpec(idp)
	spec["scopes"] = []string{"groups", "openid"}
	authDomain := newAuthDomain(t, spec)
	authN := newTestAuthN(t, authDomain)

	loginURL, err := authN.LoginURL(context.Background(), siteURL, authDomain)
	require.NoError(t, err)

	parsed, err := url.Parse(loginURL)
	require.NoError(t, err)

	assert.ElementsMatch(t, []string{"openid", "email", "profile", "groups"}, strings.Fields(parsed.Query().Get("scope")))
}

func TestLoginURL_ExternalPath(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, baseSpec(idp))

	store := authtypestest.NewMockAuthNStore(t)
	authN, err := New(context.Background(), store, instrumentationtest.New().ToProviderSettings(), global.Config{ExternalURL: &url.URL{Scheme: "https", Host: "example.com", Path: "/fusescope"}})
	require.NoError(t, err)

	loginURL, err := authN.LoginURL(context.Background(), siteURL, authDomain)
	require.NoError(t, err)

	parsed, err := url.Parse(loginURL)
	require.NoError(t, err)
	assert.Equal(t, "https://fusescope.example.com/fusescope/api/v1/complete/oidc", parsed.Query().Get("redirect_uri"))
}

func TestHandleCallback(t *testing.T) {
	testCases := []struct {
		name             string
		spec             func(idp *fakeIdP) map[string]any
		advertisedIssuer string
		audience         string
		idTokenClaims    map[string]any
		userInfoClaims   map[string]any
		userInfoStatus   int
		expectedErr      bool
		expectedName     string
		expectedEmail    string
		expectedGroups   []string
		expectedRole     string
	}{
		{
			name:           "DefaultClaims",
			spec:           baseSpec,
			idTokenClaims:  map[string]any{"email": "jane@acme.test", "email_verified": true, "name": "Jane Doe", "groups": []string{"fusescope-admins", "devs"}},
			expectedName:   "Jane Doe",
			expectedEmail:  "jane@acme.test",
			expectedGroups: []string{"fusescope-admins", "devs"},
		},
		{
			name: "CustomClaimMapping",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["claimMapping"] = map[string]any{"email": "upn", "name": "display_name", "groups": "roles_groups", "role": "fusescope_role"}
				return spec
			},
			idTokenClaims:  map[string]any{"upn": "jane@acme.test", "email_verified": true, "display_name": "Jane", "roles_groups": []string{"ops"}, "fusescope_role": "EDITOR"},
			expectedName:   "Jane",
			expectedEmail:  "jane@acme.test",
			expectedGroups: []string{"ops"},
			expectedRole:   "EDITOR",
		},
		{
			name:           "GroupsAsSingleString",
			spec:           baseSpec,
			idTokenClaims:  map[string]any{"email": "jane@acme.test", "email_verified": true, "groups": "ops"},
			expectedEmail:  "jane@acme.test",
			expectedGroups: []string{"ops"},
		},
		{
			name: "GetUserInfo_MergesClaims",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["getUserInfo"] = true
				return spec
			},
			idTokenClaims:  map[string]any{"email": "jane@acme.test", "email_verified": true},
			userInfoClaims: map[string]any{"name": "Jane From UserInfo", "groups": []string{"sre"}},
			expectedName:   "Jane From UserInfo",
			expectedEmail:  "jane@acme.test",
			expectedGroups: []string{"sre"},
		},
		{
			name: "GetUserInfo_FailureFallsBackToIDTokenClaims",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["getUserInfo"] = true
				return spec
			},
			idTokenClaims:  map[string]any{"email": "jane@acme.test", "email_verified": true, "name": "Jane", "groups": []string{"ops"}},
			userInfoStatus: http.StatusUnauthorized,
			expectedName:   "Jane",
			expectedEmail:  "jane@acme.test",
			expectedGroups: []string{"ops"},
		},
		{
			name: "GetUserInfo_SubjectMismatch_Rejected",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["getUserInfo"] = true
				return spec
			},
			idTokenClaims:  map[string]any{"email": "jane@acme.test", "email_verified": true},
			userInfoClaims: map[string]any{"sub": "someone-else", "groups": []string{"admins"}},
			expectedErr:    true,
		},
		{
			name:          "UnverifiedEmail_Rejected",
			spec:          baseSpec,
			idTokenClaims: map[string]any{"email": "jane@acme.test", "email_verified": false},
			expectedErr:   true,
		},
		{
			name: "UnverifiedEmail_AllowedWithInsecureSkip",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["insecureSkipEmailVerified"] = true
				return spec
			},
			idTokenClaims: map[string]any{"email": "jane@acme.test"},
			expectedEmail: "jane@acme.test",
		},
		{
			name:          "EmailOutsideDomain_Rejected",
			spec:          baseSpec,
			idTokenClaims: map[string]any{"email": "mallory@evil.test", "email_verified": true},
			expectedErr:   true,
		},
		{
			name:          "MissingEmail_Rejected",
			spec:          baseSpec,
			idTokenClaims: map[string]any{"email_verified": true},
			expectedErr:   true,
		},
		{
			name:          "WrongAudience_Rejected",
			spec:          baseSpec,
			audience:      "someone-else",
			idTokenClaims: map[string]any{"email": "jane@acme.test", "email_verified": true},
			expectedErr:   true,
		},
		{
			name:             "IssuerMismatchWithoutAlias_Rejected",
			spec:             baseSpec,
			advertisedIssuer: "https://login.microsoftonline.com/tenant-id/v2.0",
			idTokenClaims:    map[string]any{"email": "jane@acme.test", "email_verified": true},
			expectedErr:      true,
		},
		{
			name: "IssuerAlias_Accepted",
			spec: func(idp *fakeIdP) map[string]any {
				spec := baseSpec(idp)
				spec["issuerAlias"] = "https://login.microsoftonline.com/tenant-id/v2.0"
				return spec
			},
			advertisedIssuer: "https://login.microsoftonline.com/tenant-id/v2.0",
			idTokenClaims:    map[string]any{"email": "jane@acme.test", "email_verified": true, "name": "Jane"},
			expectedName:     "Jane",
			expectedEmail:    "jane@acme.test",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			idp := newFakeIdP(t)
			idp.advertisedIssuer = testCase.advertisedIssuer
			idp.idTokenClaims = testCase.idTokenClaims
			idp.userInfoClaims = testCase.userInfoClaims
			idp.userInfoStatus = testCase.userInfoStatus
			if testCase.audience != "" {
				idp.audience = testCase.audience
			}

			authDomain := newAuthDomain(t, testCase.spec(idp))
			authN := newTestAuthN(t, authDomain)

			identity, err := authN.HandleCallback(context.Background(), callbackQuery(t, authDomain))
			if testCase.expectedErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.expectedEmail, identity.Email.String())
			assert.Equal(t, testCase.expectedName, identity.Name)
			assert.Equal(t, testCase.expectedGroups, identity.Groups)
			assert.Equal(t, testCase.expectedRole, identity.Role)
			assert.Equal(t, authDomain.StorableAuthDomain().OrgID, identity.OrgID)
			assert.Equal(t, siteURL.Host, identity.State.URL.Host)
		})
	}
}

func TestHandleCallback_ProviderError(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, baseSpec(idp))
	authN := newTestAuthN(t, authDomain)

	query := callbackQuery(t, authDomain)
	query.Set("error", "access_denied")
	query.Set("error_description", "user cancelled")

	_, err := authN.HandleCallback(context.Background(), query)
	require.Error(t, err)
}

func TestHandleCallback_InvalidState(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, baseSpec(idp))
	authN := newTestAuthN(t, authDomain)

	_, err := authN.HandleCallback(context.Background(), url.Values{"code": {testAuthCode}, "state": {"%%%"}})
	require.Error(t, err)
}

func TestHandleCallback_BadCode(t *testing.T) {
	idp := newFakeIdP(t)
	idp.idTokenClaims = map[string]any{"email": "jane@acme.test", "email_verified": true}
	authDomain := newAuthDomain(t, baseSpec(idp))
	authN := newTestAuthN(t, authDomain)

	query := callbackQuery(t, authDomain)
	query.Set("code", "wrong")

	_, err := authN.HandleCallback(context.Background(), query)
	require.Error(t, err)
}
