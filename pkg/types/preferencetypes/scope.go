package preferencetypes

import "github.com/fuseone-io/fusescope/pkg/valuer"

var (
	ScopeOrg  = Scope{valuer.NewString("org")}
	ScopeUser = Scope{valuer.NewString("user")}
)

type Scope struct{ valuer.String }
