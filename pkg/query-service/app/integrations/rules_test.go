package integrations

import (
	"context"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// memoryRules keeps rules the way the ruler's in-org methods do: by ID,
// within an organization, creating idempotently and deleting what exists.
type memoryRules struct {
	mu    sync.Mutex
	rules map[valuer.UUID]memoryRule
	// beforeCreate, when set, runs before a rule is stored; an error fails
	// the creation.
	beforeCreate func(id valuer.UUID) error
	// beforeDelete, when set, runs before a rule is deleted; an error fails
	// the deletion.
	beforeDelete func(id valuer.UUID) error
	// failOrg, when set, fails every creation in that organization.
	failOrg valuer.UUID
	writes  int
}

type memoryRule struct {
	org   valuer.UUID
	actor string
	rule  ruletypes.PostableRule
}

func newMemoryRules() *memoryRules {
	return &memoryRules{rules: map[valuer.UUID]memoryRule{}}
}

func (r *memoryRules) CreateRuleInOrg(_ context.Context, orgID valuer.UUID, id valuer.UUID, actor string, rule *ruletypes.PostableRule) error {
	if !r.failOrg.IsZero() && orgID == r.failOrg {
		return errors.Newf(errors.TypeInternal, errors.CodeInternal, "ruler unavailable for org %s", orgID)
	}
	if r.beforeCreate != nil {
		if err := r.beforeCreate(id); err != nil {
			return err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if existing, ok := r.rules[id]; ok {
		if existing.org != orgID {
			return errors.Newf(errors.TypeAlreadyExists, errors.CodeAlreadyExists, "rule %s belongs to another organization", id)
		}
		return nil
	}
	r.rules[id] = memoryRule{org: orgID, actor: actor, rule: *rule}
	r.writes++
	return nil
}

func (r *memoryRules) EditRuleInOrg(_ context.Context, orgID valuer.UUID, id valuer.UUID, actor string, rule *ruletypes.PostableRule) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	existing, ok := r.rules[id]
	if !ok || existing.org != orgID {
		return errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "rule %s not found", id)
	}
	r.rules[id] = memoryRule{org: orgID, actor: actor, rule: *rule}
	r.writes++
	return nil
}

func (r *memoryRules) DeleteRuleInOrg(_ context.Context, orgID valuer.UUID, id valuer.UUID) error {
	if r.beforeDelete != nil {
		if err := r.beforeDelete(id); err != nil {
			return err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if existing, ok := r.rules[id]; ok && existing.org == orgID {
		delete(r.rules, id)
		r.writes++
	}
	return nil
}

func (r *memoryRules) names(orgID valuer.UUID) map[valuer.UUID]string {
	r.mu.Lock()
	defer r.mu.Unlock()
	names := map[valuer.UUID]string{}
	for id, rule := range r.rules {
		if rule.org == orgID {
			names[id] = rule.rule.AlertName.StringValue()
		}
	}
	return names
}
