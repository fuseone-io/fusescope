package rumapplication

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Ingest tokens travel only over TLS: a token file needs the listener's
// certificate and key, whether or not the RUM gateway is on.
func TestConfigIngestPolicy(t *testing.T) {
	withTLS := IngestPolicyConfig{TokenFile: "/tokens", Listen: "0.0.0.0:4321", TLS: IngestTLSConfig{CertFile: "/tls.crt", KeyFile: "/tls.key"}}
	tests := []struct {
		name   string
		policy func(p *IngestPolicyConfig)
		valid  bool
	}{
		{"off", func(p *IngestPolicyConfig) { *p = IngestPolicyConfig{Listen: "0.0.0.0:4321"} }, true},
		{"tokens with TLS", func(*IngestPolicyConfig) {}, true},
		{"tokens with mutual TLS", func(p *IngestPolicyConfig) { p.TLS.ClientCAFile = "/ca.crt" }, true},
		{"tokens without a certificate", func(p *IngestPolicyConfig) { p.TLS.CertFile = "" }, false},
		{"tokens without a key", func(p *IngestPolicyConfig) { p.TLS.KeyFile = "" }, false},
		{"tokens without a listener", func(p *IngestPolicyConfig) { p.Listen = "" }, false},
		{"a listener that is no address", func(p *IngestPolicyConfig) { p.Listen = "4321" }, false},
		{"the plaintext OpAMP port", func(p *IngestPolicyConfig) { p.Listen = "0.0.0.0:4320" }, false},
	}
	for _, test := range tests {
		for _, enabled := range []bool{true, false} {
			config := newConfig().(*Config)
			config.Enabled = enabled
			config.IngestPolicy = withTLS
			test.policy(&config.IngestPolicy)
			err := config.Validate()
			if test.valid {
				assert.NoError(t, err, "%s, gateway on: %v", test.name, enabled)
			} else {
				assert.Error(t, err, "%s, gateway on: %v", test.name, enabled)
			}
		}
	}
	assert.Equal(t, "0.0.0.0:4321", newConfig().(*Config).IngestPolicy.Listen)
}
