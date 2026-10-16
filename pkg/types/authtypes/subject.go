package authtypes

import (
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func NewSubject(resource coretypes.Resource, selector string, orgID valuer.UUID, relation *coretypes.Verb) (string, error) {
	if relation == nil {
		return resource.Prefix(orgID) + "/" + selector, nil
	}

	return resource.Prefix(orgID) + "/" + selector + "#" + relation.StringValue(), nil
}

func MustNewSubject(resource coretypes.Resource, selector string, orgID valuer.UUID, relation *coretypes.Verb) string {
	subject, err := NewSubject(resource, selector, orgID, relation)
	if err != nil {
		panic(err)
	}

	return subject
}
