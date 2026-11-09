package flighttelemetrystore

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/golang-jwt/jwt/v5"
)

// maxCachedTokens bounds the tokens kept for reuse; past it the cache starts over.
const maxCachedTokens = 4096

// signer issues the tenant tokens the engine verifies: EdDSA over Ed25519 under the key's RFC 7638
// thumbprint as kid, one per tenant and subject, reused until half its life has passed or the key
// changes.
type signer struct {
	key      *watched[ed25519.PrivateKey]
	issuer   string
	audience string
	ttl      time.Duration
	now      func() time.Time
	rotated  func(kid string)
	mu       sync.Mutex
	version  uint64
	kid      string
	cache    map[telemetrystore.Identity]cachedToken
}

type cachedToken struct {
	value   string
	renewAt time.Time
}

func newSigner(config telemetrystore.FlightJWTConfig, failed func(error), rotated func(kid string)) (*signer, error) {
	key, err := newWatched(parseSigningKey, failed, config.KeyFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.jwt.key_file")
	}
	return &signer{
		key:      key,
		issuer:   config.Issuer,
		audience: config.Audience,
		ttl:      config.TTL,
		now:      time.Now,
		rotated:  rotated,
		cache:    map[telemetrystore.Identity]cachedToken{},
	}, nil
}

func (s *signer) token(identity telemetrystore.Identity) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key, version := s.key.current()
	if version != s.version {
		s.version, s.kid = version, thumbprint(key)
		clear(s.cache)
		s.rotated(s.kid)
	}
	now := s.now()
	if cached, ok := s.cache[identity]; ok && now.Before(cached.renewAt) {
		return cached.value, nil
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss":              s.issuer,
		"aud":              s.audience,
		"sub":              identity.Subject,
		"fusescope_tenant": identity.Tenant.StringValue(),
		"iat":              now.Unix(),
		"exp":              now.Add(s.ttl).Unix(),
	})
	token.Header["kid"] = s.kid
	signed, err := token.SignedString(key)
	if err != nil {
		return "", errors.WrapInternalf(err, errors.CodeInternal, "signing the engine token")
	}
	if len(s.cache) >= maxCachedTokens {
		clear(s.cache)
	}
	s.cache[identity] = cachedToken{value: signed, renewAt: now.Add(s.ttl / 2)}
	return signed, nil
}

// thumbprint is the RFC 7638 thumbprint of the key's public half: SHA-256 over its JWK with the
// required members in lexicographic order, base64url without padding.
func thumbprint(key ed25519.PrivateKey) string {
	x := base64.RawURLEncoding.EncodeToString(key.Public().(ed25519.PublicKey))
	sum := sha256.Sum256([]byte(`{"crv":"Ed25519","kty":"OKP","x":"` + x + `"}`))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func parseSigningKey(contents [][]byte) (ed25519.PrivateKey, error) {
	block, _ := pem.Decode(contents[0])
	if block == nil {
		return nil, errors.NewInvalidInputf(telemetrystore.ErrCodeInvalidConfig, "no PEM block")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	ed, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, errors.NewInvalidInputf(telemetrystore.ErrCodeInvalidConfig, "the key is %T, not Ed25519", key)
	}
	return ed, nil
}
