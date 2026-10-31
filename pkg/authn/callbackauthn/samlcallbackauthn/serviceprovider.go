package samlcallbackauthn

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/xml"
	"net/url"
	"path"
	"time"

	saml2 "github.com/russellhaering/gosaml2"
	"github.com/russellhaering/gosaml2/types"
	dsig "github.com/russellhaering/goxmldsig"
	dsigtypes "github.com/russellhaering/goxmldsig/types"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
)

const metadataValidity = 7 * 24 * time.Hour

var _ authn.ServiceProviderMetadataAuthN = (*AuthN)(nil)

// ServiceProviderMetadata describes this service provider for an IdP to import.
// It is the same for every auth domain: the entity ID and ACS URL come from the
// site URL, and the signing certificate from the configuration. AuthnRequestsSigned
// reflects whether a key is configured; a domain may still opt out.
func (a *AuthN) ServiceProviderMetadata(ctx context.Context, siteURL *url.URL) ([]byte, error) {
	if err := a.trustServiceProviderURL(ctx, siteURL); err != nil {
		return nil, err
	}

	descriptor := &types.SPSSODescriptor{
		AuthnRequestsSigned:        a.signingKey != nil,
		WantAssertionsSigned:       true,
		ProtocolSupportEnumeration: saml2.SAMLProtocolNamespace,
		AssertionConsumerServices: []types.IndexedEndpoint{{
			Binding:  saml2.BindingHttpPost,
			Location: a.assertionConsumerServiceURL(siteURL),
			Index:    1,
		}},
	}

	if a.signingKey != nil {
		descriptor.KeyDescriptors = []types.KeyDescriptor{{
			Use: "signing",
			KeyInfo: dsigtypes.KeyInfo{X509Data: dsigtypes.X509Data{
				X509Certificates: []dsigtypes.X509Certificate{{Data: base64.StdEncoding.EncodeToString(a.signingKey.Cert)}},
			}},
		}}
	}

	metadata, err := xml.MarshalIndent(&types.EntityDescriptor{
		ValidUntil:      time.Now().UTC().Add(metadataValidity).Truncate(time.Second),
		EntityID:        siteURL.Host,
		SPSSODescriptor: descriptor,
	}, "", "  ")
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "saml: failed to encode the service provider metadata")
	}

	return append([]byte(xml.Header), metadata...), nil
}

func (a *AuthN) serviceProvider(siteURL *url.URL, samlConfig authtypes.SamlConfig) (*saml2.SAMLServiceProvider, error) {
	certificate, err := parseCertificate(samlConfig.Certificate)
	if err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "saml: invalid identity provider certificate").WithAdditional(err.Error())
	}

	sp := &saml2.SAMLServiceProvider{
		IdentityProviderSSOURL:      samlConfig.Location,
		IdentityProviderSSOBinding:  saml2.BindingHttpRedirect,
		IdentityProviderIssuer:      samlConfig.EntityID,
		ServiceProviderIssuer:       siteURL.Host,
		AudienceURI:                 siteURL.Host,
		AssertionConsumerServiceURL: a.assertionConsumerServiceURL(siteURL),
		IDPCertificateStore:         &dsig.MemoryX509CertificateStore{Roots: []*x509.Certificate{certificate}},
	}

	if a.signingKey != nil && !samlConfig.InsecureSkipAuthNRequestsSigned {
		sp.SignAuthnRequests = true
		sp.SignAuthnRequestsAlgorithm = dsig.RSASHA256SignatureMethod
		if err := sp.SetSPSigningKeyStore(a.signingKey); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "saml: invalid service provider signing key")
		}
	}

	return sp, nil
}

func (a *AuthN) assertionConsumerServiceURL(siteURL *url.URL) string {
	return (&url.URL{
		Scheme: siteURL.Scheme,
		Host:   siteURL.Host,
		Path:   path.Join(a.globalConfig.ExternalPath(), redirectPath),
	}).String()
}
