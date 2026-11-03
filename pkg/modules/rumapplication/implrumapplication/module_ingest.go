package implrumapplication

import (
	"context"
	"encoding/json"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// ingestPlatforms are the platforms of ingest policy v1; the collector
// rejects any other, so iOS applications are not published yet.
var ingestPlatforms = map[rumtypes.Platform]string{
	rumtypes.PlatformWeb:     ingestpolicy.PlatformWeb,
	rumtypes.PlatformAndroid: ingestpolicy.PlatformAndroid,
}

// ingestSignals are what a public key may send (rum.md §11.1).
var ingestSignals = []string{"traces", "logs"}

func (module *module) IngestPolicyContent(ctx context.Context, now time.Time) (*rumapplication.IngestContent, error) {
	// One more than the bounds tells an overflow from a full policy.
	storables, err := module.store.ListAllApplications(ctx, ingestpolicy.MaxApplications+1)
	if err != nil {
		return nil, err
	}
	keys, err := module.store.ListUsableKeys(ctx, now, ingestpolicy.MaxKeys+1)
	if err != nil {
		return nil, err
	}
	if len(storables) > ingestpolicy.MaxApplications || len(keys) > ingestpolicy.MaxKeys {
		return nil, errors.Newf(errors.TypeInternal, rumtypes.ErrCodeApplicationLimit, "rum applications or keys over the ingest policy bounds (%d, %d)", ingestpolicy.MaxApplications, ingestpolicy.MaxKeys)
	}
	byApplication := map[valuer.UUID][]ingestpolicy.Key{}
	for _, key := range keys {
		if key.IsUsableAt(now) {
			byApplication[key.ApplicationID] = append(byApplication[key.ApplicationID], newIngestKey(key))
		}
	}

	content := &rumapplication.IngestContent{Keys: []ingestpolicy.Key{}, Applications: []ingestpolicy.RUMApplication{}}
	logger := module.settings.Logger()
	for _, storable := range storables {
		application, err := rumtypes.NewApplicationFromStorable(storable)
		if err != nil {
			logger.ErrorContext(ctx, "rum application left out of the ingest policy: unreadable", slog.String("application_id", storable.ID.StringValue()), errors.Attr(err))
			content.Skipped++
			continue
		}
		platform, ok := ingestPlatforms[application.Platform]
		if !ok {
			content.Skipped++
			continue
		}
		ingestApplication := newIngestApplication(application, platform)
		applicationKeys := byApplication[application.ID]
		if err := validateIngestEntry(ingestApplication, applicationKeys); err != nil {
			logger.ErrorContext(ctx, "rum application left out of the ingest policy: the collector would reject it", append([]any{"application_id", ingestApplication.ID}, rejectionAttrs(err)...)...)
			content.Skipped++
			continue
		}
		content.Applications = append(content.Applications, ingestApplication)
		content.Keys = append(content.Keys, applicationKeys...)
	}
	slices.SortFunc(content.Keys, func(a, b ingestpolicy.Key) int { return strings.Compare(a.ID, b.ID) })
	return content, nil
}

// validateForIngest refuses an application the collector would reject, so
// a normal change never leaves one out of the policy.
func validateForIngest(application *rumtypes.Application) error {
	platform, ok := ingestPlatforms[application.Platform]
	if !ok {
		return nil
	}
	err := validateIngestEntry(newIngestApplication(application, platform), nil)
	var rejection *ingestpolicy.RejectionError
	if errors.As(err, &rejection) {
		return errors.NewInvalidInputf(rumtypes.ErrCodeApplicationInvalidInput, "the collector would refuse this application: %s at %s", rejection.Code, rejection.Path)
	}
	return err
}

// validateIngestEntry checks one application and its keys as the collector
// will (rum.md §11.2), so one bad application is left out alone.
func validateIngestEntry(application ingestpolicy.RUMApplication, keys []ingestpolicy.Key) error {
	return ingestpolicy.Validate(&ingestpolicy.Policy{
		SchemaVersion:   ingestpolicy.SchemaVersion,
		Version:         1,
		IssuedAt:        "1970-01-01T00:00:00Z",
		Keys:            keys,
		RUMApplications: []ingestpolicy.RUMApplication{application},
	})
}

// rejectionAttrs names the code and the field, never the value.
func rejectionAttrs(err error) []any {
	var rejection *ingestpolicy.RejectionError
	if errors.As(err, &rejection) {
		return []any{"code", string(rejection.Code), "path", rejection.Path}
	}
	return []any{"code", "unknown"}
}

func newIngestKey(key *rumtypes.ApplicationKey) ingestpolicy.Key {
	applicationID := key.ApplicationID.StringValue()
	ingestKey := ingestpolicy.Key{
		ID:            key.ID.StringValue(),
		SHA256:        key.Hash,
		OrgID:         key.OrgID.StringValue(),
		Kind:          ingestpolicy.KindPublic,
		Signals:       ingestSignals,
		ApplicationID: &applicationID,
	}
	if key.ExpiresAt != nil {
		expiresAt := key.ExpiresAt.UTC().Format(time.RFC3339)
		ingestKey.ExpiresAt = &expiresAt
	}
	return ingestKey
}

func newIngestApplication(application *rumtypes.Application, platform string) ingestpolicy.RUMApplication {
	return ingestpolicy.RUMApplication{
		ID:                  application.ID.StringValue(),
		OrgID:               application.OrgID.StringValue(),
		Name:                application.Name,
		Environment:         application.Environment,
		Platform:            platform,
		AllowedOrigins:      nonNil(application.AllowedOrigins),
		AllowedPackageNames: nonNil(application.AllowedPackageNames),
		PIIPolicy: ingestpolicy.PIIPolicy{
			DropQuery:      application.PIIPolicy.DropQuery,
			QueryAllowlist: nonNil(application.PIIPolicy.QueryAllowlist),
			URLAllowlist:   nonNil(application.PIIPolicy.URLAllowlist),
		},
	}
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

// ingestEnvelope bounds the policy's fields around its two lists.
const ingestEnvelope = 1 << 10

// maxIngestKeySize is the largest key of the policy, encoded, with its comma.
var maxIngestKeySize = func() int {
	uuid := "00000000-0000-0000-0000-000000000000"
	expiresAt := "2006-01-02T15:04:05Z"
	data, _ := json.Marshal(ingestpolicy.Key{
		ID: uuid, SHA256: strings.Repeat("0", 64), OrgID: uuid, Kind: ingestpolicy.KindPublic,
		Signals: ingestSignals, ExpiresAt: &expiresAt, ApplicationID: &uuid,
	})
	return len(data) + 1
}()

// keyReserve is the room an application's keys can take: those usable now,
// and one more while no rotation is under way, which would add one
// (RotateKey refuses while a key is expiring; CreateKey while one is
// usable). It holds for any state, so also for one an earlier release
// left, such as two active keys.
func keyReserve(counts rumtypes.KeyCounts) int {
	keys := counts.Usable
	if counts.Expiring == 0 {
		keys++
	}
	return keys * maxIngestKeySize
}

// ingestBudget is what an application can take of the policy: itself and
// the room of its keys; nothing for a platform the policy lacks.
func ingestBudget(application *rumtypes.Application, counts rumtypes.KeyCounts) int {
	platform, ok := ingestPlatforms[application.Platform]
	if !ok {
		return 0
	}
	data, _ := json.Marshal(newIngestApplication(application, platform))
	return len(data) + 1 + keyReserve(counts)
}

// ingestChange is a change checkIngestBudget weighs: an application
// created or updated, and keys added to one.
type ingestChange struct {
	application *rumtypes.Application
	keysOf      valuer.UUID
	usable      int
	expiring    int
}

// checkIngestBudget refuses a change that would grow the policy past its
// 24 MiB cap (rum.md §11.2), so no change can leave it unpublishable and
// revocations stuck. It counts the keys actually usable, at the time the
// revisions decide at. It runs after
// TouchIngestPolicy, which serialises changes, so the total holds until
// commit. A change that adds a key always fits the cap, even within room a
// state left by an earlier release already reserves; an update that does
// not grow the policy is never refused; a revocation or a deletion is
// never checked.
func (module *module) checkIngestBudget(ctx context.Context, change ingestChange) error {
	storables, err := module.store.ListAllApplications(ctx, ingestpolicy.MaxApplications+1)
	if err != nil {
		return err
	}
	// Keys are counted at the database's clock: a revision decides at it,
	// or at a floor past it, so it never holds a key not counted here,
	// whatever this process's clock says.
	now, err := module.store.DatabaseNow(ctx)
	if err != nil {
		return err
	}
	counts, err := module.store.CountUsableKeys(ctx, now)
	if err != nil {
		return err
	}
	before, after := ingestEnvelope, ingestEnvelope
	present := false
	for _, storable := range storables {
		application, err := rumtypes.NewApplicationFromStorable(storable)
		if err != nil {
			continue // left out of the policy too
		}
		keys := counts[storable.ID]
		before += ingestBudget(application, keys)
		if change.application != nil && change.application.ID == storable.ID {
			application, present = change.application, true
		}
		if change.keysOf == storable.ID {
			keys.Usable += change.usable
			keys.Expiring += change.expiring
		}
		after += ingestBudget(application, keys)
	}
	if change.application != nil && !present {
		after += ingestBudget(change.application, rumtypes.KeyCounts{Usable: change.usable, Expiring: change.expiring})
	}
	if after > module.ingestMaxSize && (change.usable > 0 || after > before) {
		return errors.Newf(errors.TypeForbidden, rumtypes.ErrCodeApplicationLimit, "the collectors' ingest policy would exceed %d bytes; remove origins, allowlists, keys or applications first", module.ingestMaxSize)
	}
	return nil
}
