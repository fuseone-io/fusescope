package retentiontypes

import (
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeMutationFailing = errors.MustNewCode("retention_mutation_failing")

// Mutation is one row of system.mutations on one replica.
type Mutation struct {
	Host       string
	ID         string
	Command    string
	CreateTime time.Time
	Done       bool
	FailReason string
}

// BlockingMutation returns an error for the first pending mutation that keeps failing,
// except a MATERIALIZE TTL created since modifiedAt: ClickHouse retries it, so it is waited
// on. The mutations of a table run in order, so any other blocks the queue. A zero
// modifiedAt spares none.
func BlockingMutation(mutations []Mutation, modifiedAt time.Time) error {
	for _, mutation := range mutations {
		if mutation.Done || mutation.FailReason == "" || mutation.materializesSince(modifiedAt) {
			continue
		}
		return errors.Newf(errors.TypeInternal, ErrCodeMutationFailing, "mutation %s on %s is failing: %s", mutation.ID, mutation.Host, mutation.FailReason)
	}
	return nil
}

// MaterializeTTLIssuedSince reports whether a MATERIALIZE TTL was created since modifiedAt
// on any host, done or not.
func MaterializeTTLIssuedSince(mutations []Mutation, modifiedAt time.Time) bool {
	for _, mutation := range mutations {
		if mutation.materializesSince(modifiedAt) {
			return true
		}
	}
	return false
}

// MaterializeTTLPendingBefore reports whether a MATERIALIZE TTL created before modifiedAt is
// still running, so another would queue a second full rewrite behind it.
func MaterializeTTLPendingBefore(mutations []Mutation, modifiedAt time.Time) bool {
	for _, mutation := range mutations {
		if !mutation.Done && mutation.isMaterializeTTL() && mutation.CreateTime.Before(modifiedAt) {
			return true
		}
	}
	return false
}

// MaterializeTTLDone reports whether every host has a MATERIALIZE TTL created since
// modifiedAt that is done. A host without one yet has not pulled it.
func MaterializeTTLDone(hosts []string, mutations []Mutation, modifiedAt time.Time) (bool, error) {
	if err := BlockingMutation(mutations, modifiedAt); err != nil {
		return false, err
	}

	done := make(map[string]bool, len(hosts))
	for _, mutation := range mutations {
		if mutation.Done && mutation.materializesSince(modifiedAt) {
			done[mutation.Host] = true
		}
	}

	for _, host := range hosts {
		if !done[host] {
			return false, nil
		}
	}
	return true, nil
}

func (mutation Mutation) isMaterializeTTL() bool {
	return strings.Contains(strings.ToUpper(mutation.Command), "MATERIALIZE TTL")
}

func (mutation Mutation) materializesSince(modifiedAt time.Time) bool {
	return !modifiedAt.IsZero() && mutation.isMaterializeTTL() && !mutation.CreateTime.Before(modifiedAt)
}
