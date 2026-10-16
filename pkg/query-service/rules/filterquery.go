package rules

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parser/filterquery/sqlcompiler"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
)

// Compile wraps compiler errors in the rules list filter error code.
func CompileListFilter(query string, formatter sqlstore.SQLFormatter) (*sqlcompiler.Compiled, error) {
	compiled, errs := sqlcompiler.Compile(query, formatter, ruleFieldResolver{})
	if len(errs) > 0 {
		return nil, errors.NewInvalidInputf(ruletypes.ErrCodeRuleListFilterInvalid,
			"invalid filter query: %s", strings.Join(errs, "; "))
	}
	return compiled, nil
}
