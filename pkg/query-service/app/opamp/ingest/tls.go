package ingest

import (
	"crypto/tls"
	"crypto/x509"
	"os"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// ServerTLS is the TLS 1.3 of the OpAMP listener ingress collectors connect
// to with their tokens (ADR 0004). The certificate is read again when its
// files change, so a renewal needs no restart; a pair that cannot be read,
// as while it is being replaced, keeps the last good one. With clientCAFile,
// every collector must present a certificate it issued.
func ServerTLS(certFile, keyFile, clientCAFile string) (*tls.Config, error) {
	reloader := &certReloader{certFile: certFile, keyFile: keyFile}
	if _, err := reloader.load(); err != nil {
		return nil, err
	}
	config := &tls.Config{
		MinVersion: tls.VersionTLS13,
		GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) {
			return reloader.current()
		},
	}
	if clientCAFile != "" {
		data, err := os.ReadFile(clientCAFile)
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "failed to read the ingest OpAMP client CA")
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(data) {
			return nil, errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "the ingest OpAMP client CA holds no certificate")
		}
		config.ClientCAs, config.ClientAuth = pool, tls.RequireAndVerifyClientCert
	}
	return config, nil
}

type certReloader struct {
	certFile, keyFile string

	mu              sync.Mutex
	cert            *tls.Certificate
	certMod, keyMod time.Time
}

// current is the pair on disk, read again if either file changed.
func (r *certReloader) current() (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	certInfo, certErr := os.Stat(r.certFile)
	keyInfo, keyErr := os.Stat(r.keyFile)
	if certErr == nil && keyErr == nil && (!certInfo.ModTime().Equal(r.certMod) || !keyInfo.ModTime().Equal(r.keyMod)) {
		if cert, err := tls.LoadX509KeyPair(r.certFile, r.keyFile); err == nil {
			r.cert, r.certMod, r.keyMod = &cert, certInfo.ModTime(), keyInfo.ModTime()
		}
	}
	return r.cert, nil
}

func (r *certReloader) load() (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	certInfo, err := os.Stat(r.certFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "failed to read the ingest OpAMP certificate")
	}
	keyInfo, err := os.Stat(r.keyFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "failed to read the ingest OpAMP key")
	}
	cert, err := tls.LoadX509KeyPair(r.certFile, r.keyFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "failed to load the ingest OpAMP certificate")
	}
	r.cert, r.certMod, r.keyMod = &cert, certInfo.ModTime(), keyInfo.ModTime()
	return r.cert, nil
}
