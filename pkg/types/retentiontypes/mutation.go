package retentiontypes

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeMutationFailing = errors.MustNewCode("retention_mutation_failing")

// Mutation is one row of system.mutations on one replica.
type Mutation struct {
	Host       string
	ID         string
	Command    string
	Done       bool
	FailReason string
}

// MaterializeTTLDone reports whether the MATERIALIZE TTL mutations missing from before are
// done on every replica. Mutations of a table run in order, so any failing one, earlier or
// unrelated, fails it instead of being waited on.
func MaterializeTTLDone(before []Mutation, after []Mutation) (bool, error) {
	seen := make(map[[2]string]bool, len(before))
	for _, mutation := range before {
		seen[[2]string{mutation.Host, mutation.ID}] = true
	}

	done := true
	for _, mutation := range after {
		if !mutation.Done && mutation.FailReason != "" {
			return false, errors.Newf(errors.TypeInternal, ErrCodeMutationFailing, "mutation %s on %s is failing: %s", mutation.ID, mutation.Host, mutation.FailReason)
		}
		if seen[[2]string{mutation.Host, mutation.ID}] || !strings.Contains(strings.ToUpper(mutation.Command), "MATERIALIZE TTL") {
			continue
		}
		done = done && mutation.Done
	}

	return done, nil
}
