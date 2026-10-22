package coretypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestManagedRolesRUMApplicationVerbs(t *testing.T) {
	testCases := []struct {
		name  string
		role  string
		verbs []Verb
	}{
		{name: "Admin_Manages", role: SigNozAdminRoleName, verbs: []Verb{VerbCreate, VerbRead, VerbUpdate, VerbDelete, VerbList}},
		{name: "Editor_Manages", role: SigNozEditorRoleName, verbs: []Verb{VerbCreate, VerbRead, VerbUpdate, VerbDelete, VerbList}},
		{name: "Viewer_Reads", role: SigNozViewerRoleName, verbs: []Verb{VerbRead, VerbList}},
		{name: "Anonymous_None", role: SigNozAnonymousRoleName, verbs: nil},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var verbs []Verb
			for _, transaction := range ManagedRoleToTransactions[testCase.role] {
				if transaction.Object.Resource.Kind == KindRUMApplication {
					verbs = append(verbs, transaction.Verb)
				}
			}
			assert.Equal(t, testCase.verbs, verbs)
		})
	}
}
