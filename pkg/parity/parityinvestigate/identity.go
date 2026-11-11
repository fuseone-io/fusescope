// Package parityinvestigate is the parity's local investigation: an on-call operator's look, in a
// terminal, at the values behind one round's fingerprints.
package parityinvestigate

import (
	"context"
	"net/url"
	"slices"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var (
	ErrCodeIdentity       = errors.MustNewCode("parity_operator_identity")
	ErrCodeIdentityConfig = errors.MustNewCode("parity_operator_identity_config")
)

// IdentityConfig is the company IdP an operator's ID token must come from, and what it must say.
type IdentityConfig struct {
	Issuer   string
	Audience string
	// GroupsClaim names the claim listing the operator's groups; Group must be one of them, exactly.
	GroupsClaim string
	Group       string
	// MaxAge is how long after its iat a token is accepted; ClockSkew, how far in the future its iat
	// may be.
	MaxAge    time.Duration
	ClockSkew time.Duration
}

// Operator is who investigates, as the IdP asserts it: the issuer and the subject identify, and the
// email, only when verified, is for display.
type Operator struct {
	Issuer  string
	Subject string
	Email   string
}

// IdentityVerifier verifies an operator's ID token. Its signature, issuer, audience, expiry and
// not-before are go-oidc's, none skipped; its age, subject and group are checked here, and its
// not-before again within ClockSkew, since go-oidc allows five minutes.
type IdentityVerifier struct {
	verifier *oidc.IDTokenVerifier
	cfg      IdentityConfig
	now      func() time.Time
}

// NewIdentityVerifier verifies tokens of cfg's issuer, against the keys its discovery document
// publishes.
//
// # Errors
//
// An incomplete configuration, or an issuer whose discovery fails.
func NewIdentityVerifier(ctx context.Context, cfg IdentityConfig) (IdentityVerifier, error) {
	if err := cfg.validate(); err != nil {
		return IdentityVerifier{}, err
	}
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return IdentityVerifier{}, errors.Wrapf(err, errors.TypeInternal, ErrCodeIdentityConfig, "the IdP's discovery failed")
	}
	var discovery struct {
		JWKS string `json:"jwks_uri"`
	}
	if err := provider.Claims(&discovery); err != nil || discovery.JWKS == "" {
		return IdentityVerifier{}, errors.Newf(errors.TypeInternal, ErrCodeIdentityConfig, "the IdP publishes no keys")
	}
	return newIdentityVerifier(oidc.NewRemoteKeySet(ctx, discovery.JWKS), cfg, time.Now)
}

func newIdentityVerifier(keys oidc.KeySet, cfg IdentityConfig, now func() time.Time) (IdentityVerifier, error) {
	if err := cfg.validate(); err != nil {
		return IdentityVerifier{}, err
	}
	verifier := oidc.NewVerifier(cfg.Issuer, keys, &oidc.Config{ClientID: cfg.Audience, Now: now})
	return IdentityVerifier{verifier: verifier, cfg: cfg, now: now}, nil
}

func (c IdentityConfig) validate() error {
	u, err := url.Parse(c.Issuer)
	if err != nil || u.Scheme != "https" || u.Host == "" || c.Audience == "" || c.GroupsClaim == "" || c.Group == "" || c.MaxAge <= 0 || c.ClockSkew < 0 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeIdentityConfig, "the operator identity needs an https issuer, an audience, a group claim and group, a max age and a clock skew")
	}
	return nil
}

// Verify is the operator raw identifies.
//
// # Errors
//
// A token that does not verify, has no iat or one outside [now - MaxAge, now + ClockSkew], a
// not-before past now + ClockSkew, no subject, or does not list the group.
func (v IdentityVerifier) Verify(ctx context.Context, raw string) (Operator, error) {
	refuse := func(why string) (Operator, error) {
		return Operator{}, errors.Newf(errors.TypeUnauthenticated, ErrCodeIdentity, "the operator's token is refused: %s", why)
	}
	token, err := v.verifier.Verify(ctx, raw)
	if err != nil {
		return refuse("it does not verify")
	}
	now := v.now()
	switch {
	case token.IssuedAt.IsZero():
		return refuse("it has no iat")
	case token.IssuedAt.Before(now.Add(-v.cfg.MaxAge)):
		return refuse("it was issued too long ago")
	case token.IssuedAt.After(now.Add(v.cfg.ClockSkew)):
		return refuse("it was issued in the future")
	case token.Subject == "":
		return refuse("it has no subject")
	}
	var claims map[string]any
	if err := token.Claims(&claims); err != nil {
		return refuse("its claims do not decode")
	}
	if nbf, ok := claims["nbf"].(float64); ok && time.Unix(int64(nbf), 0).After(now.Add(v.cfg.ClockSkew)) {
		return refuse("it is not valid yet")
	}
	if !slices.Contains(stringsOf(claims[v.cfg.GroupsClaim]), v.cfg.Group) {
		return refuse("the operator is not in the on-call group")
	}
	op := Operator{Issuer: token.Issuer, Subject: token.Subject}
	if verified, _ := claims["email_verified"].(bool); verified {
		op.Email, _ = claims["email"].(string)
	}
	return op, nil
}

// stringsOf is a claim's strings, whether it holds one or a list.
func stringsOf(v any) []string {
	switch c := v.(type) {
	case string:
		return []string{c}
	case []any:
		out := make([]string, 0, len(c))
		for _, item := range c {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
