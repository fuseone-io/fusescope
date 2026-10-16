package authtypes

import (
	"encoding/json"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type PostableEmailPasswordSession struct {
	Email    valuer.Email `json:"email"`
	Password string       `json:"password"`
	OrgID    valuer.UUID  `json:"orgId"`
}

func (typ *PostableEmailPasswordSession) UnmarshalJSON(data []byte) error {
	type Alias PostableEmailPasswordSession
	var temp Alias

	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}

	if temp.Email.IsZero() {
		return errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "email is required")
	}

	if temp.Password == "" {
		return errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "password is required")
	}

	if temp.OrgID.IsZero() {
		return errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "orgID is required")
	}

	*typ = PostableEmailPasswordSession(temp)
	return nil
}
