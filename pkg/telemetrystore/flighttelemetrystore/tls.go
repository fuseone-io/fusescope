package flighttelemetrystore

import (
	"crypto/tls"
	"crypto/x509"
	"os"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// clientTLS presents the backend's certificate, read again when its files change, over TLS 1.3,
// and trusts only the engine's CA file for the server.
func clientTLS(config telemetrystore.FlightTLSConfig, failed func(error)) (*tls.Config, error) {
	pair, err := newWatched(func(contents [][]byte) (tls.Certificate, error) {
		return tls.X509KeyPair(contents[0], contents[1])
	}, failed, config.CertFile, config.KeyFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.tls.cert_file and key_file")
	}
	out := &tls.Config{
		MinVersion: tls.VersionTLS13,
		ServerName: config.ServerName,
		GetClientCertificate: func(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
			certificate := pair.get()
			return &certificate, nil
		},
	}
	pem, err := os.ReadFile(config.CAFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.tls.ca_file")
	}
	out.RootCAs = x509.NewCertPool()
	if !out.RootCAs.AppendCertsFromPEM(pem) {
		return nil, errors.NewInvalidInputf(telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.tls.ca_file holds no certificate")
	}
	return out, nil
}
