package flighttelemetrystore

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/golang-jwt/jwt/v5"
)

// maxCachedTokens bounds the tokens kept for reuse; past it the cache starts over.
const maxCachedTokens = 4096

// signer issues the tenant tokens the engine verifies: EdDSA over Ed25519, one per tenant and
// subject, reused until half its life has passed.
type signer struct {
	key      *watched[ed25519.PrivateKey]
	kid      string
	issuer   string
	audience string
	ttl      time.Duration
	now      func() time.Time
	mu       sync.Mutex
	cache    map[telemetrystore.Identity]cachedToken
}

type cachedToken struct {
	value   string
	renewAt time.Time
}

func newSigner(config telemetrystore.FlightJWTConfig, failed func(error)) (*signer, error) {
	key, err := newWatched(parseSigningKey, failed, config.KeyFile)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.jwt.key_file")
	}
	return &signer{
		key:      key,
		kid:      config.KeyID,
		issuer:   config.Issuer,
		audience: config.Audience,
		ttl:      config.TTL,
		now:      time.Now,
		cache:    map[telemetrystore.Identity]cachedToken{},
	}, nil
}

func (s *signer) token(identity telemetrystore.Identity) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	signed, err := token.SignedString(s.key.get())
	if err != nil {
		return "", errors.WrapInternalf(err, errors.CodeInternal, "signing the engine token")
	}
	if len(s.cache) >= maxCachedTokens {
		clear(s.cache)
	}
	s.cache[identity] = cachedToken{value: signed, renewAt: now.Add(s.ttl / 2)}
	return signed, nil
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
