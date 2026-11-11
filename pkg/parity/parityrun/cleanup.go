package parityrun

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeCleanup = errors.MustNewCode("parity_run_key_cleanup")

const (
	// cleanupPage is how many Secrets one list call asks for.
	cleanupPage = 100
	// maxListAnswer caps one list answer the cleanup reads.
	maxListAnswer = 16 << 20
	expiresAtKey  = "fusescope.io/parity-expires-at"
)

// CleanupReport is what a cleanup did: the run keys it deleted, the ones it kept for having no
// readable expiry, and the ones replaced since they were listed.
type CleanupReport struct {
	Deleted   []string
	Kept      []string
	Conflicts []string
}

// SecretCleaner deletes the run keys whose expiry has passed. The expires-at annotation is the
// authority; a key without one, or with one that does not parse, is kept and reported, never
// deleted. Every page is listed before anything is deleted, and each delete is conditioned on the
// UID listed, so a Secret replaced since is left alone.
type SecretCleaner struct {
	store SecretKeyStore
	now   func() time.Time
}

// NewSecretCleaner cleans the namespace of cfg.
//
// # Errors
//
// See NewSecretKeyStore.
func NewSecretCleaner(cfg SecretKeyStoreConfig) (SecretCleaner, error) {
	store, err := NewSecretKeyStore(cfg)
	if err != nil {
		return SecretCleaner{}, err
	}
	return SecretCleaner{store: store, now: time.Now}, nil
}

type listedSecret struct {
	Metadata struct {
		Name        string            `json:"name"`
		UID         string            `json:"uid"`
		Annotations map[string]string `json:"annotations"`
	} `json:"metadata"`
}

// Clean deletes the expired run keys.
//
// # Errors
//
// An unreadable token or CA, a list call that fails or does not decode, or a delete that fails for
// another reason than a changed UID.
func (c SecretCleaner) Clean(ctx context.Context) (CleanupReport, error) {
	secrets, err := c.list(ctx)
	if err != nil {
		return CleanupReport{}, err
	}
	var report CleanupReport
	now := c.now()
	for _, s := range secrets {
		expires, err := time.Parse(time.RFC3339, s.Metadata.Annotations[expiresAtKey])
		if err != nil {
			report.Kept = append(report.Kept, s.Metadata.Name)
			continue
		}
		if !now.After(expires) {
			continue
		}
		switch err := c.delete(ctx, s.Metadata.Name, s.Metadata.UID); {
		case err == nil:
			report.Deleted = append(report.Deleted, s.Metadata.Name)
		case errors.Asc(err, ErrCodeRequeueConflict):
			report.Conflicts = append(report.Conflicts, s.Metadata.Name)
		default:
			return report, err
		}
	}
	return report, nil
}

func (c SecretCleaner) endpoint() string {
	return strings.TrimSuffix(c.store.cfg.APIServer, "/") + "/api/v1/namespaces/" + url.PathEscape(c.store.cfg.Namespace) + "/secrets"
}

func (c SecretCleaner) list(ctx context.Context) ([]listedSecret, error) {
	client, token, err := c.store.client()
	if err != nil {
		return nil, err
	}
	var out []listedSecret
	next := ""
	for {
		query := url.Values{"labelSelector": {"app.kubernetes.io/name=fusescope-parity"}, "limit": {strconv.Itoa(cleanupPage)}}
		if next != "" {
			query.Set("continue", next)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint()+"?"+query.Encode(), nil)
		if err != nil {
			return nil, errors.WrapInternalf(err, ErrCodeCleanup, "error building a list call")
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeCleanup, "the run keys could not be listed")
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, maxListAnswer))
		_ = resp.Body.Close()
		if err != nil || resp.StatusCode != http.StatusOK {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeCleanup, "the run keys could not be listed: %d", resp.StatusCode)
		}
		var page struct {
			Items    []listedSecret `json:"items"`
			Metadata struct {
				Continue string `json:"continue"`
			} `json:"metadata"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeCleanup, "a list answer does not decode")
		}
		out = append(out, page.Items...)
		if page.Metadata.Continue == "" {
			return out, nil
		}
		next = page.Metadata.Continue
	}
}

func (c SecretCleaner) delete(ctx context.Context, name, uid string) error {
	client, token, err := c.store.client()
	if err != nil {
		return err
	}
	body, _ := json.Marshal(map[string]any{"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": map[string]string{"uid": uid}})
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.endpoint()+"/"+url.PathEscape(name), bytes.NewReader(body))
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeCleanup, "error building a delete call")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return errors.Newf(errors.TypeInternal, ErrCodeCleanup, "a run key could not be deleted")
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK, http.StatusAccepted:
		return nil
	case http.StatusConflict:
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeRequeueConflict, "the run key changed since it was listed")
	}
	return errors.Newf(errors.TypeInternal, ErrCodeCleanup, "a run key could not be deleted: %d", resp.StatusCode)
}
