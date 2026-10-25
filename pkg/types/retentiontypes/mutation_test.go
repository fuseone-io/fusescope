package retentiontypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMaterializeTTLDone(t *testing.T) {
	before := []Mutation{
		{Host: "ch-1", ID: "mutation_1.txt", Command: "DELETE WHERE 1", Done: true},
		{Host: "ch-1", ID: "mutation_2.txt", Command: "MATERIALIZE TTL", Done: true},
	}

	testCases := []struct {
		name     string
		after    []Mutation
		wantDone bool
		wantErr  string
	}{
		{
			name:     "OwnMutationRunning_NotDone",
			after:    append(before, Mutation{Host: "ch-1", ID: "mutation_3.txt", Command: "MATERIALIZE TTL"}),
			wantDone: false,
		},
		{
			name:     "OwnMutationDoneOnEveryReplica_Done",
			after:    append(before, Mutation{Host: "ch-1", ID: "0000000003", Command: "MATERIALIZE TTL", Done: true}, Mutation{Host: "ch-2", ID: "0000000003", Command: "MATERIALIZE TTL", Done: true}),
			wantDone: true,
		},
		{
			name:     "OwnMutationDoneOnOneReplicaOnly_NotDone",
			after:    append(before, Mutation{Host: "ch-1", ID: "0000000003", Command: "MATERIALIZE TTL", Done: true}, Mutation{Host: "ch-2", ID: "0000000003", Command: "MATERIALIZE TTL"}),
			wantDone: false,
		},
		{
			name:     "UnrelatedMutationRunning_Done",
			after:    append(before, Mutation{Host: "ch-1", ID: "mutation_3.txt", Command: "MATERIALIZE TTL", Done: true}, Mutation{Host: "ch-1", ID: "mutation_4.txt", Command: "UPDATE x = 1 WHERE 1"}),
			wantDone: true,
		},
		{
			name:    "OwnMutationFailing_Error",
			after:   append(before, Mutation{Host: "ch-1", ID: "mutation_3.txt", Command: "MATERIALIZE TTL", FailReason: "Memory limit exceeded"}),
			wantErr: "Memory limit exceeded",
		},
		{
			name:    "EarlierMutationStuck_Error",
			after:   append([]Mutation{{Host: "ch-1", ID: "mutation_0.txt", Command: "UPDATE x = 1 WHERE 1", FailReason: "Cannot parse"}}, append(before, Mutation{Host: "ch-1", ID: "mutation_3.txt", Command: "MATERIALIZE TTL"})...),
			wantErr: "Cannot parse",
		},
		{
			name:     "OwnMutationAlreadyCleanedUp_Done",
			after:    before,
			wantDone: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			done, err := MaterializeTTLDone(before, testCase.after)
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
