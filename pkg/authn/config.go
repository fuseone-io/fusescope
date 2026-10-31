package authn

import (
	"crypto"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"os"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

type Config struct {
	SAML SAMLConfig `mapstructure:"saml"`
}

type SAMLConfig struct {
	// Service provider key pair: signs AuthnRequests and is published in the
	// service provider metadata. Unset, AuthnRequests are sent unsigned.
	Signing SAMLSigningConfig `mapstructure:"signing"`
}

// SAMLSigningConfig takes each part either inline or from a file (e.g. a mounted
// secret), both PEM. The key must be RSA.
type SAMLSigningConfig struct {
	Key             string `mapstructure:"key"`
	KeyFile         string `mapstructure:"key_file"`
	Certificate     string `mapstructure:"certificate"`
	CertificateFile string `mapstructure:"certificate_file"`
}

type SAMLKeyPair struct {
	Signer      crypto.Signer
	Certificate *x509.Certificate
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("authn"), newConfig)
}

func newConfig() factory.Config {
	return Config{}
}

func (c Config) Validate() error {
	if !c.SAML.Signing.IsConfigured() {
		return nil
	}

	_, err := c.SAML.Signing.KeyPair()
	return err
}

func (c SAMLSigningConfig) IsConfigured() bool {
	return c.Key != "" || c.KeyFile != "" || c.Certificate != "" || c.CertificateFile != ""
}

// String and MarshalJSON keep an inline key out of logs (the loaded config is logged at debug level).
func (c SAMLSigningConfig) String() string {
	return fmt.Sprintf("{Key:%s KeyFile:%s Certificate:%s CertificateFile:%s}", c.redactedKey(), c.KeyFile, c.Certificate, c.CertificateFile)
}

func (c SAMLSigningConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{"key": c.redactedKey(), "key_file": c.KeyFile, "certificate": c.Certificate, "certificate_file": c.CertificateFile})
}

func (c SAMLSigningConfig) KeyPair() (*SAMLKeyPair, error) {
	keyPEM, err := readPEM("key", c.Key, c.KeyFile)
	if err != nil {
		return nil, err
	}

	certificatePEM, err := readPEM("certificate", c.Certificate, c.CertificateFile)
	if err != nil {
		return nil, err
	}

	if keyPEM == nil || certificatePEM == nil {
		return nil, errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "authn: saml signing needs both a key and a certificate")
	}

	// The parse error is dropped: it may quote the key material.
	pair, err := tls.X509KeyPair(certificatePEM, keyPEM)
	if err != nil {
		return nil, errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "authn: saml signing key and certificate are invalid or do not match")
	}

	signer, ok := pair.PrivateKey.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "authn: saml signing key must be RSA")
	}

	return &SAMLKeyPair{Signer: signer, Certificate: pair.Leaf}, nil
}

func (c SAMLSigningConfig) redactedKey() string {
	if c.Key == "" {
		return ""
	}

	return "<redacted>"
}

func readPEM(name string, inline string, file string) ([]byte, error) {
	if inline != "" && file != "" {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "authn: saml signing %s is set both inline and as a file", name)
	}

	if inline != "" {
		return []byte(inline), nil
	}

	if file == "" {
		return nil, nil
	}

	data, err := os.ReadFile(file)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "authn: cannot read saml signing %s file", name)
	}

	return data, nil
}
