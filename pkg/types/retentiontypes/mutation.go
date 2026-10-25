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

// FailingMutation returns an error for the first pending mutation that keeps failing. The
// mutations of a table run in order, so it blocks every later one.
func FailingMutation(mutations []Mutation) error {
	for _, mutation := range mutations {
		if !mutation.Done && mutation.FailReason != "" {
			return errors.Newf(errors.TypeInternal, ErrCodeMutationFailing, "mutation %s on %s is failing: %s", mutation.ID, mutation.Host, mutation.FailReason)
		}
	}
	return nil
}

func MaterializeTTLPending(mutations []Mutation) bool {
	for _, mutation := range mutations {
		if !mutation.Done && mutation.isMaterializeTTL() {
			return true
		}
	}
	return false
}

// MaterializeTTLDone reports whether every host has a MATERIALIZE TTL missing from before,
// and all of them are done. A host without one yet has not pulled it.
func MaterializeTTLDone(hosts []string, before []Mutation, after []Mutation) (bool, error) {
	if err := FailingMutation(after); err != nil {
		return false, err
	}

	seen := make(map[[2]string]bool, len(before))
	for _, mutation := range before {
		seen[[2]string{mutation.Host, mutation.ID}] = true
	}

	issued := make(map[string]bool, len(hosts))
	for _, mutation := range after {
		if seen[[2]string{mutation.Host, mutation.ID}] || !mutation.isMaterializeTTL() {
			continue
		}
		if !mutation.Done {
			return false, nil
		}
		issued[mutation.Host] = true
	}

	for _, host := range hosts {
		if !issued[host] {
			return false, nil
		}
	}
	return true, nil
}

func (mutation Mutation) isMaterializeTTL() bool {
	return strings.Contains(strings.ToUpper(mutation.Command), "MATERIALIZE TTL")
}
