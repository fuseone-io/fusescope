package samlcallbackauthn

import (
	"bytes"
	"compress/flate"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/cache/memorycache"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes/authtypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	testDomain    = "saml.example.com"
	testIdPIssuer = "https://idp.example.com/realms/master"
	testIdPSSO    = "https://idp.example.com/realms/master/protocol/saml"
	testEmail     = "viewer@saml.example.com"
)

var siteURL = &url.URL{Scheme: "https", Host: "fusescope.example.com", Path: "/login"}

type fakeIdP struct {
	keyStore dsig.X509KeyStore
	certB64  string
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()

	keyStore := dsig.RandomKeyStoreForTest()
	_, cert, err := keyStore.GetKeyPair()
	require.NoError(t, err)

	return &fakeIdP{keyStore: keyStore, certB64: base64.StdEncoding.EncodeToString(cert)}
}

type response struct {
	id           string
	assertionID  string
	issuer       string
	audience     string
	destination  string
	status       string
	nameID       string
	notBefore    time.Time
	notOnOrAfter time.Time
	attributes   map[string][]string
	unsigned     bool
	signer       *fakeIdP
}

func validResponse(idp *fakeIdP) response {
	now := time.Now().UTC()

	return response{
		id:           "_resp-" + valuer.GenerateUUID().String(),
		assertionID:  "_assert-" + valuer.GenerateUUID().String(),
		issuer:       testIdPIssuer,
		audience:     siteURL.Host,
		destination:  "https://fusescope.example.com/api/v1/complete/saml",
		status:       "urn:oasis:names:tc:SAML:2.0:status:Success",
		nameID:       testEmail,
		notBefore:    now.Add(-time.Minute),
		notOnOrAfter: now.Add(5 * time.Minute),
		attributes: map[string][]string{
			"urn:oid:1.2.840.113549.1.9.1|email": {testEmail},
			"displayName|displayName":            {"Viewer"},
			"groups|groups":                      {"observers", "oncall"},
			"signoz_role|signoz_role":            {"VIEWER"},
		},
		signer: idp,
	}
}

func (r response) encode(t *testing.T) string {
	t.Helper()

	instant := time.Now().UTC().Format(time.RFC3339)
	doc := etree.NewDocument()

	resp := doc.CreateElement("samlp:Response")
	resp.CreateAttr("xmlns:samlp", "urn:oasis:names:tc:SAML:2.0:protocol")
	resp.CreateAttr("xmlns:saml", "urn:oasis:names:tc:SAML:2.0:assertion")
	resp.CreateAttr("ID", r.id)
	resp.CreateAttr("Version", "2.0")
	resp.CreateAttr("IssueInstant", instant)
	resp.CreateAttr("Destination", r.destination)
	resp.CreateElement("saml:Issuer").SetText(r.issuer)
	resp.CreateElement("samlp:Status").CreateElement("samlp:StatusCode").CreateAttr("Value", r.status)

	assertion := resp.CreateElement("saml:Assertion")
	assertion.CreateAttr("ID", r.assertionID)
	assertion.CreateAttr("Version", "2.0")
	assertion.CreateAttr("IssueInstant", instant)
	assertion.CreateElement("saml:Issuer").SetText(r.issuer)

	subject := assertion.CreateElement("saml:Subject")
	nameID := subject.CreateElement("saml:NameID")
	nameID.CreateAttr("Format", "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress")
	nameID.SetText(r.nameID)
	confirmation := subject.CreateElement("saml:SubjectConfirmation")
	confirmation.CreateAttr("Method", "urn:oasis:names:tc:SAML:2.0:cm:bearer")
	confirmationData := confirmation.CreateElement("saml:SubjectConfirmationData")
	confirmationData.CreateAttr("NotOnOrAfter", r.notOnOrAfter.Format(time.RFC3339))
	confirmationData.CreateAttr("Recipient", r.destination)

	conditions := assertion.CreateElement("saml:Conditions")
	conditions.CreateAttr("NotBefore", r.notBefore.Format(time.RFC3339))
	conditions.CreateAttr("NotOnOrAfter", r.notOnOrAfter.Format(time.RFC3339))
	conditions.CreateElement("saml:AudienceRestriction").CreateElement("saml:Audience").SetText(r.audience)

	authnStatement := assertion.CreateElement("saml:AuthnStatement")
	authnStatement.CreateAttr("AuthnInstant", instant)
	authnStatement.CreateAttr("SessionIndex", "session-1")
	authnStatement.CreateElement("saml:AuthnContext").CreateElement("saml:AuthnContextClassRef").SetText("urn:oasis:names:tc:SAML:2.0:ac:classes:Password")

	statement := assertion.CreateElement("saml:AttributeStatement")
	for key, values := range r.attributes {
		name, friendlyName, _ := strings.Cut(key, "|")
		attribute := statement.CreateElement("saml:Attribute")
		attribute.CreateAttr("Name", name)
		attribute.CreateAttr("FriendlyName", friendlyName)
		for _, value := range values {
			attribute.CreateElement("saml:AttributeValue").SetText(value)
		}
	}

	root := resp
	if !r.unsigned {
		signed, err := dsig.NewDefaultSigningContext(r.signer.keyStore).SignEnveloped(resp)
		require.NoError(t, err)
		root = signed
	}

	out := etree.NewDocument()
	out.SetRoot(root)
	raw, err := out.WriteToBytes()
	require.NoError(t, err)

	return base64.StdEncoding.EncodeToString(raw)
}

func newAuthDomain(t *testing.T, idp *fakeIdP, attributeMapping map[string]any) *authtypes.AuthDomain {
	t.Helper()

	spec := map[string]any{"entityId": testIdPIssuer, "location": testIdPSSO, "certificate": idp.certB64}
	if attributeMapping != nil {
		spec["attributeMapping"] = attributeMapping
	}

	data, err := json.Marshal(map[string]any{
		"name":    testDomain,
		"enabled": true,
		"config":  map[string]any{"kind": "saml", "spec": spec},
	})
	require.NoError(t, err)

	var postable authtypes.PostableAuthDomain
	require.NoError(t, json.Unmarshal(data, &postable))

	authDomain, err := authtypes.NewAuthDomainFromPostableAuthDomain(&postable, valuer.GenerateUUID())
	require.NoError(t, err)

	return authDomain
}

func newTestCache(t *testing.T) cache.Cache {
	t.Helper()

	c, err := memorycache.New(context.Background(), instrumentationtest.New().ToProviderSettings(), cache.Config{Provider: "memory", Memory: cache.Memory{NumCounters: 10_000, MaxCost: 1 << 20}})
	require.NoError(t, err)

	return c
}

func newTestAuthN(t *testing.T, authDomain *authtypes.AuthDomain, globalConfig global.Config) *AuthN {
	t.Helper()

	store := authtypestest.NewMockAuthNStore(t)
	store.EXPECT().GetAuthDomainFromID(mock.Anything, mock.Anything).Return(authDomain, nil).Maybe()

	authN, err := New(context.Background(), store, instrumentationtest.New().ToProviderSettings(), globalConfig, newTestCache(t))
	require.NoError(t, err)

	return authN
}

func callbackForm(authDomain *authtypes.AuthDomain, encoded string) url.Values {
	return url.Values{
		"SAMLResponse": {encoded},
		"RelayState":   {authtypes.NewState(siteURL, authDomain.StorableAuthDomain().ID).URL.String()},
	}
}

func TestLoginURL(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, nil)
	authN := newTestAuthN(t, authDomain, global.Config{})

	loginURL, err := authN.LoginURL(context.Background(), siteURL, authDomain)
	require.NoError(t, err)

	parsed, err := url.Parse(loginURL)
	require.NoError(t, err)
	assert.Equal(t, testIdPSSO, parsed.Scheme+"://"+parsed.Host+parsed.Path)

	state, err := authtypes.NewStateFromString(parsed.Query().Get("RelayState"))
	require.NoError(t, err)
	assert.Equal(t, authDomain.StorableAuthDomain().ID, state.DomainID)

	deflated, err := base64.StdEncoding.DecodeString(parsed.Query().Get("SAMLRequest"))
	require.NoError(t, err)
	request, err := io.ReadAll(flate.NewReader(bytes.NewReader(deflated)))
	require.NoError(t, err)

	doc := etree.NewDocument()
	require.NoError(t, doc.ReadFromBytes(request))
	assert.Equal(t, "https://fusescope.example.com/api/v1/complete/saml", doc.Root().SelectAttrValue("AssertionConsumerServiceURL", ""))
	assert.Equal(t, siteURL.Host, doc.Root().FindElement("./Issuer").Text())
}

func TestHandleCallback(t *testing.T) {
	idp := newFakeIdP(t)
	otherIdP := newFakeIdP(t)

	testCases := []struct {
		name          string
		mutate        func(*response)
		mapping       map[string]any
		wantForbidden bool
		wantEmail     string
	}{
		{name: "SignedResponse_Accepted", mutate: func(*response) {}, wantEmail: testEmail},
		{name: "NoEmailAttribute_FallsBackToNameID", mutate: func(r *response) {
			delete(r.attributes, "urn:oid:1.2.840.113549.1.9.1|email")
		}, wantEmail: testEmail},
		{name: "SignedByOtherKey_Rejected", mutate: func(r *response) { r.signer = otherIdP }, wantForbidden: true},
		{name: "Unsigned_Rejected", mutate: func(r *response) { r.unsigned = true }, wantForbidden: true},
		{name: "WrongAudience_Rejected", mutate: func(r *response) { r.audience = "someone-else.example.com" }, wantForbidden: true},
		{name: "Expired_Rejected", mutate: func(r *response) {
			r.notBefore = time.Now().Add(-20 * time.Minute)
			r.notOnOrAfter = time.Now().Add(-10 * time.Minute)
		}, wantForbidden: true},
		{name: "NotYetValid_Rejected", mutate: func(r *response) {
			r.notBefore = time.Now().Add(10 * time.Minute)
			r.notOnOrAfter = time.Now().Add(20 * time.Minute)
		}, wantForbidden: true},
		{name: "WrongIssuer_Rejected", mutate: func(r *response) { r.issuer = "https://evil.example.com" }, wantForbidden: true},
		{name: "FailedStatus_Rejected", mutate: func(r *response) { r.status = "urn:oasis:names:tc:SAML:2.0:status:Requester" }, wantForbidden: true},
		{name: "EmailOutsideDomain_Rejected", mutate: func(r *response) {
			r.nameID = "viewer@other.example.com"
			r.attributes["urn:oid:1.2.840.113549.1.9.1|email"] = []string{"viewer@other.example.com"}
		}, wantForbidden: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			authDomain := newAuthDomain(t, idp, testCase.mapping)
			authN := newTestAuthN(t, authDomain, global.Config{})

			resp := validResponse(idp)
			testCase.mutate(&resp)

			identity, err := authN.HandleCallback(context.Background(), callbackForm(authDomain, resp.encode(t)))
			if testCase.wantForbidden {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeForbidden), err.Error())
				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.wantEmail, identity.Email.String())
			assert.Equal(t, authDomain.StorableAuthDomain().OrgID, identity.OrgID)
			assert.Equal(t, authDomain.StorableAuthDomain().ID, identity.State.DomainID)
		})
	}
}

func TestHandleCallback_AttributeMapping(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, map[string]any{"name": "displayName", "groups": "groups", "role": "signoz_role"})
	authN := newTestAuthN(t, authDomain, global.Config{})

	identity, err := authN.HandleCallback(context.Background(), callbackForm(authDomain, validResponse(idp).encode(t)))
	require.NoError(t, err)

	assert.Equal(t, "Viewer", identity.Name)
	assert.ElementsMatch(t, []string{"observers", "oncall"}, identity.Groups)
	assert.Equal(t, "VIEWER", identity.Role)
}

func TestHandleCallback_ReplayRejected(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, nil)
	authN := newTestAuthN(t, authDomain, global.Config{})
	form := callbackForm(authDomain, validResponse(idp).encode(t))

	_, err := authN.HandleCallback(context.Background(), form)
	require.NoError(t, err)

	_, err = authN.HandleCallback(context.Background(), form)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeForbidden), err.Error())
}

func TestHandleCallback_InvalidRelayState(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, nil)
	authN := newTestAuthN(t, authDomain, global.Config{})

	_, err := authN.HandleCallback(context.Background(), url.Values{"SAMLResponse": {validResponse(idp).encode(t)}, "RelayState": {"not a state"}})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err.Error())
}

func TestProviderInfo(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, nil)
	externalURL, err := url.Parse("https://fusescope.example.com/signoz")
	require.NoError(t, err)
	authN := newTestAuthN(t, authDomain, global.Config{ExternalURL: externalURL})

	info := authN.ProviderInfo(context.Background(), authDomain)
	require.NotNil(t, info.RelayStatePath)
	assert.False(t, strings.HasPrefix(*info.RelayStatePath, "/"))

	state, err := authtypes.NewStateFromString("https://fusescope.example.com/" + *info.RelayStatePath)
	require.NoError(t, err)
	assert.Equal(t, authDomain.StorableAuthDomain().ID, state.DomainID)
	assert.Equal(t, "/signoz", state.URL.Path)
}

func TestHandleCallback_TrustedOrigin(t *testing.T) {
	idp := newFakeIdP(t)
	fusescopeURL, err := url.Parse("https://fusescope.example.com")
	require.NoError(t, err)
	stagingURL := &url.URL{Scheme: "https", Host: "staging.example.com", Path: "/login"}

	testCases := []struct {
		name          string
		globalConfig  global.Config
		relayURL      *url.URL
		wantForbidden bool
	}{
		{name: "ExternalURL_RelayStateMatches_Accepted", globalConfig: global.Config{ExternalURL: fusescopeURL}, relayURL: siteURL},
		{name: "ExternalURL_RelayStateForgedHost_Rejected", globalConfig: global.Config{ExternalURL: fusescopeURL}, relayURL: stagingURL, wantForbidden: true},
		{name: "AllowedOrigins_RelayStateAllowed_Accepted", globalConfig: global.Config{AllowedOrigins: []*url.URL{fusescopeURL}}, relayURL: siteURL},
		{name: "AllowedOrigins_RelayStateForgedHost_Rejected", globalConfig: global.Config{AllowedOrigins: []*url.URL{fusescopeURL}}, relayURL: stagingURL, wantForbidden: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			authDomain := newAuthDomain(t, idp, nil)
			authN := newTestAuthN(t, authDomain, testCase.globalConfig)

			resp := validResponse(idp)
			resp.audience = testCase.relayURL.Host
			resp.destination = "https://" + testCase.relayURL.Host + "/api/v1/complete/saml"

			form := url.Values{
				"SAMLResponse": {resp.encode(t)},
				"RelayState":   {authtypes.NewState(testCase.relayURL, authDomain.StorableAuthDomain().ID).URL.String()},
			}

			_, err := authN.HandleCallback(context.Background(), form)
			if testCase.wantForbidden {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeForbidden), err.Error())
				return
			}

			require.NoError(t, err)
		})
	}
}
