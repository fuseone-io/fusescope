package parity

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// MinRunKeyBytes is the shortest run key accepted: 256 bits.
const MinRunKeyBytes = 32

// segmentHexDigits is how much of a segment's HMAC a path keeps: 64 bits, enough to tell the
// segments of one report apart.
const segmentHexDigits = 16

var ErrCodeRunKey = errors.MustNewCode("parity_run_key")

// Fingerprint stands for a compared value in a report: its HMAC under the run key, its type and its
// length, never the value.
type Fingerprint struct {
	MAC    string `json:"mac"`
	Type   string `json:"type"`
	Length int    `json:"length"`
}

// Fingerprinter writes values and dynamic path segments as HMAC-SHA-256 under one run's key, so a
// report carries no tenant data and only a holder of the key can match a fingerprint to a value.
type Fingerprinter struct {
	key []byte
}

// Dynamic marks a path segment that names tenant data, such as a service, an operation or a span.
type Dynamic string

// NewFingerprinter refuses a key shorter than MinRunKeyBytes.
func NewFingerprinter(key []byte) (*Fingerprinter, error) {
	if len(key) < MinRunKeyBytes {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeRunKey, "a run key needs %d bytes, got %d", MinRunKeyBytes, len(key))
	}
	return &Fingerprinter{key: append([]byte(nil), key...)}, nil
}

// Value is the fingerprint of v. The type is part of what is signed, so 1, int64(1) and "1" never
// share a fingerprint, and neither do null and the empty string.
func (f *Fingerprinter) Value(v any) Fingerprint {
	typ, length := describe(v)
	encoded, err := json.Marshal(v)
	if err != nil {
		encoded = []byte(fmt.Sprintf("%#v", v))
	}
	return Fingerprint{MAC: f.mac(typ + "\x00" + string(encoded)), Type: typ, Length: length}
}

// Segment is the short fingerprint of a dynamic path segment.
func (f *Fingerprinter) Segment(s string) string {
	return "h:" + f.mac("segment\x00" + s)[:segmentHexDigits]
}

// Path joins segments: a fixed one, a field of the contract, as it is; a Dynamic one as its
// fingerprint, in brackets.
func (f *Fingerprinter) Path(segments ...any) string {
	var b strings.Builder
	for _, segment := range segments {
		switch s := segment.(type) {
		case Dynamic:
			b.WriteString("[" + f.Segment(string(s)) + "]")
		default:
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			fmt.Fprint(&b, s)
		}
	}
	return b.String()
}

func (f *Fingerprinter) mac(message string) string {
	h := hmac.New(sha256.New, f.key)
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

func describe(v any) (string, int) {
	switch x := v.(type) {
	case nil:
		return "null", 0
	case string:
		return "string", len(x)
	case bool:
		return "bool", 0
	case []any:
		return "list", len(x)
	case map[string]any:
		return "object", len(x)
	}
	return fmt.Sprintf("%T", v), 0
}
