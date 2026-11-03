package ingest

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"io"
	"os"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeInvalidTokens = errors.MustNewCode("ingest_policy_invalid_tokens")

const (
	// MinTokenLength keeps a token out of guessing range: 32 characters of
	// any reasonable alphabet are well over 128 bits. MaxTokenLength is the
	// collector's bound too (fusescope-collector-server docs/spec/opamp.md §8).
	MinTokenLength = 32
	MaxTokenLength = 256
	maxTokenFile   = 64 << 10
)

// Tokens authenticate the ingress collectors, which present one as
// `Authorization: Bearer` on the OpAMP connection (ADR 0010 §3). Only
// their SHA-256 digests are held. The file holds one token per line, so a
// new token can be added before the old one is removed; blank lines and
// lines starting with # are ignored.
type Tokens struct {
	digests [][sha256.Size]byte
}

func LoadTokens(path string) (*Tokens, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, ErrCodeInvalidTokens, "ingest policy token file unreadable")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxTokenFile+1))
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, ErrCodeInvalidTokens, "ingest policy token file unreadable")
	}
	if len(data) > maxTokenFile {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidTokens, "ingest policy token file over %d bytes", maxTokenFile)
	}
	tokens := &Tokens{}
	for number, line := range bytes.Split(data, []byte("\n")) {
		token := strings.TrimSpace(string(line))
		if token == "" || strings.HasPrefix(token, "#") {
			continue
		}
		// The line number only: a token is never logged.
		if len(token) < MinTokenLength || len(token) > MaxTokenLength || strings.ContainsAny(token, " \t") {
			return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidTokens, "ingest policy token on line %d must be %d to %d characters with no spaces", number+1, MinTokenLength, MaxTokenLength)
		}
		tokens.digests = append(tokens.digests, sha256.Sum256([]byte(token)))
	}
	if len(tokens.digests) == 0 {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidTokens, "ingest policy token file holds no token")
	}
	return tokens, nil
}

// Verify reports whether an Authorization header carries one of the tokens.
// It compares the digest with every token, in constant time.
func (tokens *Tokens) Verify(authorization string) bool {
	scheme, token, ok := strings.Cut(authorization, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || token == "" {
		return false
	}
	if len(token) > MaxTokenLength {
		return false
	}
	digest := sha256.Sum256([]byte(token))
	match := 0
	for _, known := range tokens.digests {
		match |= subtle.ConstantTimeCompare(digest[:], known[:])
	}
	return match == 1
}
