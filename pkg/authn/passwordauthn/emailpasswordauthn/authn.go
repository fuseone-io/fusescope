package emailpasswordauthn

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var _ authn.PasswordAuthN = (*AuthN)(nil)

type AuthN struct {
	store authtypes.AuthNStore
}

func New(store authtypes.AuthNStore) *AuthN {
	return &AuthN{store: store}
}

func (a *AuthN) Authenticate(ctx context.Context, email string, password string, orgID valuer.UUID) (*authtypes.Identity, error) {
	user, factorPassword, _, err := a.store.GetActiveUserAndFactorPasswordByEmailAndOrgID(ctx, email, orgID)
	if err != nil {
		return nil, err
	}

	if !factorPassword.Equals(password) {
		return nil, errors.New(errors.TypeUnauthenticated, types.ErrCodeIncorrectPassword, "invalid email or password")
	}

	return authtypes.NewPrincipalUserIdentity(user.ID, orgID, user.Email, authtypes.IdentNProviderTokenizer), nil
}
