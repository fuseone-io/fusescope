package samlcallbackauthn

import (
	"bytes"
	"compress/flate"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"io"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/beevik/etree"
	"github.com/russellhaering/gosaml2/types"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
)

func newSigningConfig(t *testing.T) (authn.SAMLConfig, *x509.Certificate) {
	t.Helper()

	key, certDER, err := dsig.RandomKeyStoreForTest().GetKeyPair()
	require.NoError(t, err)
	certificate, err := x509.ParseCertificate(certDER)
	require.NoError(t, err)

	return authn.SAMLConfig{Signing: authn.SAMLSigningConfig{
		Key:         string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})),
		Certificate: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})),
	}}, certificate
}

func TestNew_InvalidSigningConfig(t *testing.T) {
	samlConfig, _ := newSigningConfig(t)
	samlConfig.Signing.Certificate = ""

	_, err := New(context.Background(), nil, instrumentationtest.New().ToProviderSettings(), global.Config{}, newTestCache(t), samlConfig)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err.Error())
}

func TestLoginURL_Signing(t *testing.T) {
	idp := newFakeIdP(t)
	samlConfig, certificate := newSigningConfig(t)

	testCases := []struct {
		name       string
		samlConfig authn.SAMLConfig
		skip       bool
		wantSigned bool
	}{
		{name: "KeyConfigured_Signed", samlConfig: samlConfig, wantSigned: true},
		{name: "KeyConfigured_InsecureSkip_Unsigned", samlConfig: samlConfig, skip: true},
		{name: "NoKey_Unsigned", samlConfig: authn.SAMLConfig{}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			authDomain := newAuthDomainFromSpec(t, map[string]any{
				"entityId":                        testIdPIssuer,
				"location":                        testIdPSSO,
				"certificate":                     idp.certB64,
				"insecureSkipAuthNRequestsSigned": testCase.skip,
			})
			authN := newTestAuthNWithConfig(t, authDomain, global.Config{}, testCase.samlConfig)

			loginURL, err := authN.LoginURL(context.Background(), siteURL, authDomain)
			require.NoError(t, err)

			parsed, err := url.Parse(loginURL)
			require.NoError(t, err)

			deflated, err := base64.StdEncoding.DecodeString(parsed.Query().Get("SAMLRequest"))
			require.NoError(t, err)
			request, err := io.ReadAll(flate.NewReader(bytes.NewReader(deflated)))
			require.NoError(t, err)
			doc := etree.NewDocument()
			require.NoError(t, doc.ReadFromBytes(request))
			assert.Nil(t, doc.Root().FindElement("./Signature"), "the redirect binding signs the query, not the document")

			if !testCase.wantSigned {
				assert.Empty(t, parsed.Query().Get("SigAlg"))
				assert.Empty(t, parsed.Query().Get("Signature"))
				return
			}

			assert.Equal(t, dsig.RSASHA256SignatureMethod, parsed.Query().Get("SigAlg"))

			// SAML bindings 3.4.4.1: the signature covers the raw, still URL-encoded
			// SAMLRequest, RelayState and SigAlg parameters, in that order.
			rawParams := map[string]string{}
			for _, param := range strings.Split(parsed.RawQuery, "&") {
				name, _, _ := strings.Cut(param, "=")
				rawParams[name] = param
			}
			signed := strings.Join([]string{rawParams["SAMLRequest"], rawParams["RelayState"], rawParams["SigAlg"]}, "&")
			digest := sha256.Sum256([]byte(signed))

			signature, err := base64.StdEncoding.DecodeString(parsed.Query().Get("Signature"))
			require.NoError(t, err)
			assert.NoError(t, rsa.VerifyPKCS1v15(certificate.PublicKey.(*rsa.PublicKey), crypto.SHA256, digest[:], signature))
		})
	}
}

func TestServiceProviderMetadata(t *testing.T) {
	samlConfig, certificate := newSigningConfig(t)
	fusescopeURL, err := url.Parse("https://fusescope.example.com")
	require.NoError(t, err)

	testCases := []struct {
		name          string
		samlConfig    authn.SAMLConfig
		globalConfig  global.Config
		siteURL       *url.URL
		wantSigned    bool
		wantForbidden bool
	}{
		{name: "KeyConfigured_PublishesCertificate", samlConfig: samlConfig, siteURL: siteURL, wantSigned: true},
		{name: "NoKey_NoCertificate", samlConfig: authn.SAMLConfig{}, siteURL: siteURL},
		{name: "ExternalURL_ForgedHost_Rejected", samlConfig: samlConfig, globalConfig: global.Config{ExternalURL: fusescopeURL}, siteURL: &url.URL{Scheme: "https", Host: "evil.example.com"}, wantForbidden: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			authN := newTestAuthNWithConfig(t, nil, testCase.globalConfig, testCase.samlConfig)

			metadata, err := authN.ServiceProviderMetadata(context.Background(), testCase.siteURL)
			if testCase.wantForbidden {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeForbidden), err.Error())
				return
			}
			require.NoError(t, err)

			var descriptor types.EntityDescriptor
			require.NoError(t, xml.Unmarshal(metadata, &descriptor))
			require.NotNil(t, descriptor.SPSSODescriptor)

			assert.Equal(t, siteURL.Host, descriptor.EntityID)
			assert.True(t, descriptor.SPSSODescriptor.WantAssertionsSigned)
			assert.Equal(t, testCase.wantSigned, descriptor.SPSSODescriptor.AuthnRequestsSigned)
			require.Len(t, descriptor.SPSSODescriptor.AssertionConsumerServices, 1)
			assert.Equal(t, "https://fusescope.example.com/api/v1/complete/saml", descriptor.SPSSODescriptor.AssertionConsumerServices[0].Location)
			assert.Equal(t, "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST", descriptor.SPSSODescriptor.AssertionConsumerServices[0].Binding)

			if !testCase.wantSigned {
				assert.Empty(t, descriptor.SPSSODescriptor.KeyDescriptors)
				return
			}

			require.Len(t, descriptor.SPSSODescriptor.KeyDescriptors, 1)
			keyDescriptor := descriptor.SPSSODescriptor.KeyDescriptors[0]
			assert.Equal(t, "signing", keyDescriptor.Use)
			require.Len(t, keyDescriptor.KeyInfo.X509Data.X509Certificates, 1)
			assert.Equal(t, base64.StdEncoding.EncodeToString(certificate.Raw), keyDescriptor.KeyInfo.X509Data.X509Certificates[0].Data)
		})
	}
}

func TestHandleCallback_ConcurrentReplayRejected(t *testing.T) {
	idp := newFakeIdP(t)
	authDomain := newAuthDomain(t, idp, nil)
	authN := newTestAuthN(t, authDomain, global.Config{})
	form := callbackForm(authDomain, validResponse(idp).encode(t))

	var accepted atomic.Int32
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := authN.HandleCallback(context.Background(), form); err == nil {
				accepted.Add(1)
			}
		}()
	}

	wg.Wait()
	assert.Equal(t, int32(1), accepted.Load())
}
