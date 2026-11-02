package retentiontypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBlockingMutation(t *testing.T) {
	modifiedAt := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	before := modifiedAt.Add(-time.Minute)
	after := modifiedAt.Add(time.Minute)

	testCases := []struct {
		name      string
		mutations []Mutation
		since     time.Time
		wantErr   string
	}{
		{name: "NoneFailing", mutations: []Mutation{{Host: "ch-1", ID: "mutation_1.txt", Command: "MATERIALIZE TTL", CreateTime: before}}, since: modifiedAt},
		{name: "DoneAfterFailing_Ignored", mutations: []Mutation{{Host: "ch-1", ID: "mutation_1.txt", Command: "MATERIALIZE TTL", CreateTime: before, Done: true, FailReason: "Memory limit exceeded"}}, since: modifiedAt},
		{name: "UnrelatedPendingAndFailing_Error", mutations: []Mutation{{Host: "ch-2", ID: "mutation_1.txt", Command: "UPDATE x = 1 WHERE 1", CreateTime: after, FailReason: "Cannot parse"}}, since: modifiedAt, wantErr: "Cannot parse"},
		{name: "EarlierMaterializeTTLFailing_Error", mutations: []Mutation{{Host: "ch-1", ID: "mutation_1.txt", Command: "MATERIALIZE TTL", CreateTime: before, FailReason: "Too many parts"}}, since: modifiedAt, wantErr: "Too many parts"},
		{name: "OwnMaterializeTTLFailing_Waited", mutations: []Mutation{{Host: "ch-1", ID: "mutation_2.txt", Command: "MATERIALIZE TTL", CreateTime: modifiedAt, FailReason: "Memory limit exceeded"}}, since: modifiedAt},
		{name: "NotModifiedYet_EveryMaterializeTTLIsUnrelated", mutations: []Mutation{{Host: "ch-1", ID: "mutation_2.txt", Command: "MATERIALIZE TTL", CreateTime: after, FailReason: "Memory limit exceeded"}}, wantErr: "Memory limit exceeded"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := BlockingMutation(testCase.mutations, testCase.since)
			if testCase.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), testCase.wantErr)
		})
	}
}

func TestMaterializeTTLSince(t *testing.T) {
	modifiedAt := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	earlier := Mutation{Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(-time.Second)}
	own := Mutation{Command: "MATERIALIZE TTL", CreateTime: modifiedAt}
	update := Mutation{Command: "UPDATE x = 1 WHERE 1", CreateTime: modifiedAt.Add(time.Second)}

	assert.False(t, MaterializeTTLIssuedSince([]Mutation{earlier, update}, modifiedAt))
	assert.True(t, MaterializeTTLIssuedSince([]Mutation{earlier, own}, modifiedAt))
	assert.False(t, MaterializeTTLIssuedSince([]Mutation{own}, time.Time{}))

	assert.True(t, MaterializeTTLPendingBefore([]Mutation{earlier}, modifiedAt))
	assert.False(t, MaterializeTTLPendingBefore([]Mutation{own, update}, modifiedAt))
	earlier.Done = true
	assert.False(t, MaterializeTTLPendingBefore([]Mutation{earlier}, modifiedAt))
}

func TestMaterializeTTLDone(t *testing.T) {
	hosts := []string{"ch-1", "ch-2"}
	modifiedAt := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	earlier := []Mutation{
		{Host: "ch-1", ID: "0000000001", Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(-time.Hour), Done: true},
		{Host: "ch-2", ID: "0000000001", Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(-time.Hour), Done: true},
	}
	own := func(host string, done bool) Mutation {
		return Mutation{Host: host, ID: "0000000002", Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(time.Second), Done: done}
	}

	testCases := []struct {
		name      string
		mutations []Mutation
		wantDone  bool
		wantErr   string
	}{
		{name: "OwnMutationRunning_NotDone", mutations: append(earlier, own("ch-1", false), own("ch-2", false))},
		{name: "OwnMutationDoneOnEveryReplica_Done", mutations: append(earlier, own("ch-1", true), own("ch-2", true)), wantDone: true},
		{name: "OwnMutationDoneOnOneReplicaOnly_NotDone", mutations: append(earlier, own("ch-1", true), own("ch-2", false))},
		{name: "OwnMutationNotYetOnAReplica_NotDone", mutations: append(earlier, own("ch-1", true))},
		{name: "OnlyEarlierMutations_NotDone", mutations: earlier},
		{name: "UnrelatedMutationRunning_Done", mutations: append(earlier, own("ch-1", true), own("ch-2", true), Mutation{Host: "ch-1", ID: "0000000003", Command: "UPDATE x = 1 WHERE 1", CreateTime: modifiedAt.Add(time.Minute)}), wantDone: true},
		{name: "OwnMutationRetrying_NotDone", mutations: append(earlier, Mutation{Host: "ch-1", ID: "0000000002", Command: "MATERIALIZE TTL", CreateTime: modifiedAt, FailReason: "Memory limit exceeded"}, own("ch-2", true))},
		{name: "EarlierMutationStuck_Error", mutations: append([]Mutation{{Host: "ch-2", ID: "0000000000", Command: "UPDATE x = 1 WHERE 1", CreateTime: modifiedAt.Add(-time.Hour), FailReason: "Cannot parse"}}, own("ch-1", false), own("ch-2", false)), wantErr: "Cannot parse"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			done, err := MaterializeTTLDone(hosts, testCase.mutations, modifiedAt)
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
