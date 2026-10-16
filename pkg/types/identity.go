package types

import (
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Identifiable struct {
	ID valuer.UUID `json:"id" bun:"id,pk,type:text" required:"true"`
}
