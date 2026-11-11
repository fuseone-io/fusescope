package parityinvestigate

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const issuer = "https://idp.example.com"

var now = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

func idp(t *testing.T) (*rsa.PrivateKey, IdentityVerifier) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	cfg := IdentityConfig{Issuer: issuer, Audience: "fusescope-parity-investigate", GroupsClaim: "groups", Group: "staging-oncall", MaxAge: 10 * time.Minute, ClockSkew: 30 * time.Second}
	v, err := newIdentityVerifier(&oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{key.Public()}}, cfg, func() time.Time { return now })
	require.NoError(t, err)
	return key, v
}

func claims(change func(jwt.MapClaims)) jwt.MapClaims {
	c := jwt.MapClaims{
		"iss": issuer, "aud": "fusescope-parity-investigate", "sub": "u-123",
		"iat": now.Add(-time.Minute).Unix(), "exp": now.Add(5 * time.Minute).Unix(),
		"groups": []string{"engineering", "staging-oncall"}, "email": "ana@example.com", "email_verified": true,
	}
	if change != nil {
		change(c)
	}
	return c
}

func sign(t *testing.T, key *rsa.PrivateKey, c jwt.MapClaims) string {
	t.Helper()
	raw, err := jwt.NewWithClaims(jwt.SigningMethodRS256, c).SignedString(key)
	require.NoError(t, err)
	return raw
}

func TestAnOnCallOperatorIsIdentifiedByIssuerAndSubject(t *testing.T) {
	key, v := idp(t)
	op, err := v.Verify(t.Context(), sign(t, key, claims(nil)))
	require.NoError(t, err)
	assert.Equal(t, Operator{Issuer: issuer, Subject: "u-123", Email: "ana@example.com"}, op)

	unverified, err := v.Verify(t.Context(), sign(t, key, claims(func(c jwt.MapClaims) { c["email_verified"] = false })))
	require.NoError(t, err)
	assert.Empty(t, unverified.Email, "an unverified email is not shown")
}

func TestAnIdentityIsRefusedOnAnyDoubt(t *testing.T) {
	key, v := idp(t)
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	cases := map[string]string{
		"another signer":       sign(t, other, claims(nil)),
		"another issuer":       sign(t, key, claims(func(c jwt.MapClaims) { c["iss"] = "https://evil.example.com" })),
		"another audience":     sign(t, key, claims(func(c jwt.MapClaims) { c["aud"] = "fusescope-backend" })),
		"expired":              sign(t, key, claims(func(c jwt.MapClaims) { c["exp"] = now.Add(-time.Second).Unix() })),
		"not yet valid":        sign(t, key, claims(func(c jwt.MapClaims) { c["nbf"] = now.Add(time.Minute).Unix() })),
		"no iat":               sign(t, key, claims(func(c jwt.MapClaims) { delete(c, "iat") })),
		"issued too long ago":  sign(t, key, claims(func(c jwt.MapClaims) { c["iat"] = now.Add(-11 * time.Minute).Unix() })),
		"issued in the future": sign(t, key, claims(func(c jwt.MapClaims) { c["iat"] = now.Add(time.Minute).Unix() })),
		"no subject":           sign(t, key, claims(func(c jwt.MapClaims) { c["sub"] = "" })),
		"not on call":          sign(t, key, claims(func(c jwt.MapClaims) { c["groups"] = []string{"engineering"} })),
		"a near group":         sign(t, key, claims(func(c jwt.MapClaims) { c["groups"] = []string{"staging-oncall-readonly"} })),
		"no groups":            sign(t, key, claims(func(c jwt.MapClaims) { delete(c, "groups") })),
		"not a token":          "not.a.token",
	}
	for name, raw := range cases {
		_, err := v.Verify(t.Context(), raw)
		assert.Error(t, err, name)
	}
	_, err = v.Verify(t.Context(), sign(t, key, claims(func(c jwt.MapClaims) { c["iat"] = now.Add(20 * time.Second).Unix() })))
	assert.NoError(t, err, "within the clock skew")
}

func TestAnIdentityConfigurationIsCompleteOrRefused(t *testing.T) {
	good := IdentityConfig{Issuer: issuer, Audience: "a", GroupsClaim: "groups", Group: "g", MaxAge: time.Minute, ClockSkew: time.Second}
	for name, change := range map[string]func(*IdentityConfig){
		"no issuer":   func(c *IdentityConfig) { c.Issuer = "" },
		"plain http":  func(c *IdentityConfig) { c.Issuer = "http://idp" },
		"no audience": func(c *IdentityConfig) { c.Audience = "" },
		"no group":    func(c *IdentityConfig) { c.Group = "" },
		"no claim":    func(c *IdentityConfig) { c.GroupsClaim = "" },
		"no max age":  func(c *IdentityConfig) { c.MaxAge = 0 },
		"no skew":     func(c *IdentityConfig) { c.ClockSkew = -1 },
	} {
		c := good
		change(&c)
		_, err := newIdentityVerifier(&oidc.StaticKeySet{}, c, time.Now)
		assert.Error(t, err, name)
	}
}
