package catalog

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"golang.org/x/mod/semver"
)

var operators = []string{">=", "<=", "!=", "==", ">", "<", "="}

// satisfies reports whether version meets constraint, a list of comparisons
// separated by commas or spaces that must all hold, such as ">=0.154.0, <1.0.0".
// A version that is not semver, as in development builds, satisfies every
// constraint.
func satisfies(version string, constraint string) (bool, error) {
	clauses := strings.FieldsFunc(constraint, func(r rune) bool { return r == ',' || r == ' ' })
	if len(clauses) == 0 {
		return true, nil
	}

	current := canonical(version)
	ok := true
	for i := 0; i < len(clauses); i++ {
		clause := clauses[i]
		operator := "="
		for _, candidate := range operators {
			if strings.HasPrefix(clause, candidate) {
				operator = candidate
				clause = strings.TrimPrefix(clause, candidate)
				break
			}
		}
		// An operator may be written apart from its version: ">= 0.154.0".
		if clause == "" && i+1 < len(clauses) {
			i++
			clause = clauses[i]
		}
		bound := canonical(clause)
		if bound == "" {
			return false, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid fusescope constraint %q", constraint)
		}
		if current == "" {
			continue
		}
		ok = ok && compare(semver.Compare(current, bound), operator)
	}
	return ok, nil
}

func canonical(version string) string {
	if !strings.HasPrefix(version, "v") {
		version = "v" + version
	}
	if !semver.IsValid(version) {
		return ""
	}
	return version
}

func compare(cmp int, operator string) bool {
	switch operator {
	case ">=":
		return cmp >= 0
	case "<=":
		return cmp <= 0
	case ">":
		return cmp > 0
	case "<":
		return cmp < 0
	case "!=":
		return cmp != 0
	default:
		return cmp == 0
	}
}
