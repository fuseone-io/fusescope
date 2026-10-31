package retentiontypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFailingMutation(t *testing.T) {
	testCases := []struct {
		name      string
		mutations []Mutation
		wantErr   string
	}{
		{name: "NoneFailing", mutations: []Mutation{{Host: "ch-1", ID: "mutation_1.txt", Command: "MATERIALIZE TTL"}}},
		{name: "DoneAfterFailing_Ignored", mutations: []Mutation{{Host: "ch-1", ID: "mutation_1.txt", Command: "MATERIALIZE TTL", Done: true, FailReason: "Memory limit exceeded"}}},
		{name: "PendingAndFailing_Error", mutations: []Mutation{{Host: "ch-2", ID: "mutation_1.txt", Command: "UPDATE x = 1 WHERE 1", FailReason: "Cannot parse"}}, wantErr: "Cannot parse"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := FailingMutation(testCase.mutations)
			if testCase.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), testCase.wantErr)
		})
	}
}

func TestMaterializeTTLPending(t *testing.T) {
	assert.False(t, MaterializeTTLPending([]Mutation{{Command: "MATERIALIZE TTL", Done: true}, {Command: "UPDATE x = 1 WHERE 1"}}))
	assert.True(t, MaterializeTTLPending([]Mutation{{Command: "MATERIALIZE TTL", Done: true}, {Command: "MATERIALIZE TTL"}}))
}

func TestMaterializeTTLDone(t *testing.T) {
	hosts := []string{"ch-1", "ch-2"}
	before := []Mutation{
		{Host: "ch-1", ID: "0000000001", Command: "DELETE WHERE 1", Done: true},
		{Host: "ch-2", ID: "0000000001", Command: "DELETE WHERE 1", Done: true},
		{Host: "ch-1", ID: "0000000002", Command: "MATERIALIZE TTL", Done: true},
		{Host: "ch-2", ID: "0000000002", Command: "MATERIALIZE TTL", Done: true},
	}
	own := func(host string, done bool) Mutation {
		return Mutation{Host: host, ID: "0000000003", Command: "MATERIALIZE TTL", Done: done}
	}

	testCases := []struct {
		name     string
		after    []Mutation
		wantDone bool
		wantErr  string
	}{
		{name: "OwnMutationRunning_NotDone", after: append(before, own("ch-1", false), own("ch-2", false))},
		{name: "OwnMutationDoneOnEveryReplica_Done", after: append(before, own("ch-1", true), own("ch-2", true)), wantDone: true},
		{name: "OwnMutationDoneOnOneReplicaOnly_NotDone", after: append(before, own("ch-1", true), own("ch-2", false))},
		{name: "OwnMutationNotYetOnAReplica_NotDone", after: append(before, own("ch-1", true))},
		{name: "OwnMutationNotVisibleYet_NotDone", after: before},
		{name: "UnrelatedMutationRunning_Done", after: append(before, own("ch-1", true), own("ch-2", true), Mutation{Host: "ch-1", ID: "0000000004", Command: "UPDATE x = 1 WHERE 1"}), wantDone: true},
		{name: "OwnMutationFailing_Error", after: append(before, Mutation{Host: "ch-1", ID: "0000000003", Command: "MATERIALIZE TTL", FailReason: "Memory limit exceeded"}, own("ch-2", true)), wantErr: "Memory limit exceeded"},
		{name: "EarlierMutationStuck_Error", after: append([]Mutation{{Host: "ch-2", ID: "0000000000", Command: "UPDATE x = 1 WHERE 1", FailReason: "Cannot parse"}}, append(before, own("ch-1", false), own("ch-2", false))...), wantErr: "Cannot parse"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			done, err := MaterializeTTLDone(hosts, before, testCase.after)
			if testCase.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), testCase.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.wantDone, done)
		})
	}
}
