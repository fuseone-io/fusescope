package parityrun

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// SecretKeyStoreConfig names the Kubernetes API server and namespace a round's key is written to,
// the service account's token and CA files, and how long a key is kept.
type SecretKeyStoreConfig struct {
	APIServer string
	Namespace string
	TokenFile string
	CAFile    string
	Expiry    time.Duration
}

// SecretKeyStore writes each run key once, as an immutable Secret the parity can create and not
// read. Its service account token and CA are read again on every write, so their rotation is
// picked up. Only 201 Created stores a key: a conflict, any other answer or a failed request fails
// the round closed, and is never retried, since a key may then exist that no report names.
type SecretKeyStore struct {
	cfg SecretKeyStoreConfig
	now func() time.Time
}

// NewSecretKeyStore is a key store over the Kubernetes API.
//
// # Errors
//
// An API server that is not https, or no namespace, token, CA or expiry.
func NewSecretKeyStore(cfg SecretKeyStoreConfig) (SecretKeyStore, error) {
	u, err := url.Parse(cfg.APIServer)
	if err != nil || u.Scheme != "https" || u.Host == "" || cfg.Namespace == "" || cfg.TokenFile == "" || cfg.CAFile == "" || cfg.Expiry <= 0 {
		return SecretKeyStore{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRunKey, "the run key store needs an https API server, a namespace, the service account's token and CA, and an expiry")
	}
	return SecretKeyStore{cfg: cfg, now: time.Now}, nil
}

type secretManifest struct {
	APIVersion string            `json:"apiVersion"`
	Kind       string            `json:"kind"`
	Metadata   secretMetadata    `json:"metadata"`
	Type       string            `json:"type"`
	Immutable  bool              `json:"immutable"`
	Data       map[string]string `json:"data"`
}

type secretMetadata struct {
	Name        string            `json:"name"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
}

// Store writes key as the Secret keyID.
//
// # Errors
//
// An unreadable token or CA, a request that failed, or any answer but 201 Created.
func (s SecretKeyStore) Store(ctx context.Context, keyID string, key []byte) error {
	client, token, err := s.client()
	if err != nil {
		return err
	}
	expires := s.now().UTC().Add(s.cfg.Expiry)
	body, err := json.Marshal(secretManifest{
		APIVersion: "v1", Kind: "Secret", Type: "Opaque", Immutable: true,
		Metadata: secretMetadata{
			Name:        keyID,
			Labels:      map[string]string{"app.kubernetes.io/name": "fusescope-parity", "fusescope.io/parity-expires-on": expires.Format("20060102")},
			Annotations: map[string]string{"fusescope.io/parity-expires-at": expires.Format(time.RFC3339)},
		},
		Data: map[string]string{"key": base64.StdEncoding.EncodeToString(key)},
	})
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeRunKey, "error encoding the run key's Secret")
	}
	endpoint := strings.TrimSuffix(s.cfg.APIServer, "/") + "/api/v1/namespaces/" + url.PathEscape(s.cfg.Namespace) + "/secrets"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeRunKey, "error building the run key's request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return errors.Newf(errors.TypeInternal, ErrCodeRunKey, "the run key's Secret may or may not exist: the request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		return errors.Newf(errors.TypeInternal, ErrCodeRunKey, "the API server did not create the run key's Secret: %d", resp.StatusCode)
	}
	return nil
}

func (s SecretKeyStore) client() (*http.Client, string, error) {
	token, err := os.ReadFile(s.cfg.TokenFile)
	if err != nil || strings.TrimSpace(string(token)) == "" {
		return nil, "", errors.Newf(errors.TypeInvalidInput, ErrCodeRunKey, "the service account token is missing")
	}
	ca, err := os.ReadFile(s.cfg.CAFile)
	pool := x509.NewCertPool()
	if err != nil || !pool.AppendCertsFromPEM(ca) {
		return nil, "", errors.Newf(errors.TypeInvalidInput, ErrCodeRunKey, "the service account CA is missing")
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}
	return &http.Client{Transport: transport, Timeout: 30 * time.Second}, strings.TrimSpace(string(token)), nil
}
