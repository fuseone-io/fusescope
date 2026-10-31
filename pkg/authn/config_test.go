package authn

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

func newPEMKeyPair(t *testing.T, key any, public any) (string, string) {
	t.Helper()

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "fusescope-sp"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, public, key)
	require.NoError(t, err)

	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)

	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})),
		string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func newRSAPEMKeyPair(t *testing.T) (string, string) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	return newPEMKeyPair(t, key, &key.PublicKey)
}

func TestSAMLSigningConfigKeyPair(t *testing.T) {
	keyPEM, certPEM := newRSAPEMKeyPair(t)
	_, otherCertPEM := newRSAPEMKeyPair(t)

	ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	ecKeyPEM, ecCertPEM := newPEMKeyPair(t, ecKey, &ecKey.PublicKey)

	dir := t.TempDir()
	keyFile := filepath.Join(dir, "sp.key")
	certFile := filepath.Join(dir, "sp.crt")
	require.NoError(t, os.WriteFile(keyFile, []byte(keyPEM), 0o600))
	require.NoError(t, os.WriteFile(certFile, []byte(certPEM), 0o600))

	testCases := []struct {
		name    string
		config  SAMLSigningConfig
		wantErr bool
	}{
		{name: "NotConfigured", config: SAMLSigningConfig{}, wantErr: true},
		{name: "Inline", config: SAMLSigningConfig{Key: keyPEM, Certificate: certPEM}},
		{name: "Files", config: SAMLSigningConfig{KeyFile: keyFile, CertificateFile: certFile}},
		{name: "InlineKeyCertificateFile", config: SAMLSigningConfig{Key: keyPEM, CertificateFile: certFile}},
		{name: "KeyWithoutCertificate", config: SAMLSigningConfig{Key: keyPEM}, wantErr: true},
		{name: "CertificateWithoutKey", config: SAMLSigningConfig{Certificate: certPEM}, wantErr: true},
		{name: "KeyInlineAndFile", config: SAMLSigningConfig{Key: keyPEM, KeyFile: keyFile, Certificate: certPEM}, wantErr: true},
		{name: "CertificateInlineAndFile", config: SAMLSigningConfig{Key: keyPEM, Certificate: certPEM, CertificateFile: certFile}, wantErr: true},
		{name: "MissingFile", config: SAMLSigningConfig{KeyFile: filepath.Join(dir, "missing.key"), CertificateFile: certFile}, wantErr: true},
		{name: "MismatchedCertificate", config: SAMLSigningConfig{Key: keyPEM, Certificate: otherCertPEM}, wantErr: true},
		{name: "NotPEM", config: SAMLSigningConfig{Key: "not a key", Certificate: certPEM}, wantErr: true},
		{name: "ECDSAKey", config: SAMLSigningConfig{Key: ecKeyPEM, Certificate: ecCertPEM}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			keyPair, err := testCase.config.KeyPair()
			if testCase.wantErr {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err.Error())
				assert.NotContains(t, err.Error(), "PRIVATE KEY")
				return
			}

			require.NoError(t, err)
			require.NotNil(t, keyPair)
			assert.IsType(t, &rsa.PrivateKey{}, keyPair.Signer)
			block, _ := pem.Decode([]byte(certPEM))
			assert.Equal(t, block.Bytes, keyPair.Certificate.Raw)
		})
	}
}

func TestSAMLSigningConfigIsConfigured(t *testing.T) {
	assert.False(t, SAMLSigningConfig{}.IsConfigured())
	assert.True(t, SAMLSigningConfig{CertificateFile: "/etc/fusescope/sp.crt"}.IsConfigured())
}

func TestConfigValidate(t *testing.T) {
	keyPEM, _ := newRSAPEMKeyPair(t)

	assert.NoError(t, newConfig().Validate())
	assert.Error(t, Config{SAML: SAMLConfig{Signing: SAMLSigningConfig{Key: keyPEM}}}.Validate())
}

func TestSAMLSigningConfigRedactsKey(t *testing.T) {
	keyPEM, certPEM := newRSAPEMKeyPair(t)
	config := Config{SAML: SAMLConfig{Signing: SAMLSigningConfig{Key: keyPEM, Certificate: certPEM}}}

	data, err := json.Marshal(config)
	require.NoError(t, err)

	for _, rendered := range []string{string(data), fmt.Sprintf("%+v", config), fmt.Sprint(config)} {
		assert.NotContains(t, rendered, "PRIVATE KEY")
		assert.Contains(t, rendered, "CERTIFICATE")
	}
}
