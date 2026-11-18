package watchdogtypes

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strings"
	"time"

	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// ResolvedIssueRetention is how long a resolved issue is kept before
// retention deletes it.
const ResolvedIssueRetention = 90 * 24 * time.Hour

var (
	ErrCodeInvalidIssue  = errors.MustNewCode("watchdog_invalid_issue")
	ErrCodeIssueNotFound = errors.MustNewCode("watchdog_issue_not_found")
)

var (
	StatusOpen         = Status{valuer.NewString("open")}
	StatusAcknowledged = Status{valuer.NewString("acknowledged")}
	StatusResolved     = Status{valuer.NewString("resolved")}
	StatusMuted        = Status{valuer.NewString("muted")}
)

var (
	SeverityWarning = Severity{valuer.NewString("warning")}
	// SeverityCritical is reserved until a critical mapping is calibrated.
	SeverityCritical = Severity{valuer.NewString("critical")}
)

type Status struct{ valuer.String }

type Severity struct{ valuer.String }

type Issue struct {
	bun.BaseModel `bun:"table:watchdog_issue,alias:watchdog_issue"`

	types.Identifiable
	types.TimeAuditable
	OrgID            valuer.UUID `bun:"org_id" json:"orgId" required:"true"`
	Detector         Detector    `bun:"detector" json:"detector" required:"true"`
	Service          string      `bun:"service" json:"service" required:"true"`
	Fingerprint      string      `bun:"fingerprint" json:"fingerprint" required:"true"`
	Status           Status      `bun:"status" json:"status" required:"true"`
	Severity         Severity    `bun:"severity" json:"severity" required:"true"`
	FirstSeen        time.Time   `bun:"first_seen" json:"firstSeen" required:"true"`
	LastSeen         time.Time   `bun:"last_seen" json:"lastSeen" required:"true"`
	ResolvedAt       *time.Time  `bun:"resolved_at" json:"resolvedAt"`
	MutedUntil       *time.Time  `bun:"muted_until" json:"mutedUntil"`
	PeakScore        *float64    `bun:"peak_score" json:"peakScore"`
	CleanEvaluations int         `bun:"clean_evaluations" json:"cleanEvaluations" required:"true"`
	LastEvaluatedAt  *time.Time  `bun:"last_evaluated_at" json:"lastEvaluatedAt"`
	Evidence         *Evidence   `bun:"evidence" json:"evidence" required:"true"`
}

func (Status) Enum() []any {
	return []any{StatusOpen, StatusAcknowledged, StatusResolved, StatusMuted}
}

// IsActive reports whether the status holds the issue's fingerprint: an
// organization has at most one active issue per fingerprint.
func (status Status) IsActive() bool {
	return status == StatusOpen || status == StatusAcknowledged || status == StatusMuted
}

func (Severity) Enum() []any {
	return []any{SeverityWarning, SeverityCritical}
}

// NewFingerprint identifies what an issue is about. The key is
// detector NUL service, plus NUL groupID for new_exception; it is stored as
// its SHA-256 in hex because PostgreSQL text cannot hold NUL.
func NewFingerprint(detector Detector, service string, groupID string) (string, error) {
	if !detector.IsValid() {
		return "", errors.Newf(errors.TypeInvalidInput, ErrCodeUnknownDetector, "unknown watchdog detector %q", detector.StringValue())
	}
	if service == "" {
		return "", errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidIssue, "an issue needs a service")
	}
	parts := []string{detector.StringValue(), service}
	switch {
	case detector == DetectorNewException && groupID == "":
		return "", errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidIssue, "a new_exception issue needs an exception group")
	case detector == DetectorNewException:
		parts = append(parts, groupID)
	case groupID != "":
		return "", errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidIssue, "only new_exception issues have an exception group")
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:]), nil
}

// Mute silences an active issue until a future time; evaluations after it
// open the issue again.
func (issue *Issue) Mute(until time.Time, now time.Time) error {
	if !issue.Status.IsActive() {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidIssue, "a %s issue can't be muted", issue.Status.StringValue())
	}
	if !until.After(now) {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidIssue, "an issue is muted until a future time")
	}
	issue.Status = StatusMuted
	issue.MutedUntil = &until
	issue.UpdatedAt = now
	return nil
}

func (issue *Issue) isMutedAt(now time.Time) bool {
	return issue.Status == StatusMuted && issue.MutedUntil != nil && now.Before(*issue.MutedUntil)
}

func (issue *Issue) recordAnomaly(evaluation Evaluation) {
	issue.LastSeen = evaluation.End
	issue.Evidence = evaluation.Evidence
	issue.PeakScore = mostExtreme(issue.PeakScore, evaluation.PeakScore)
	issue.CleanEvaluations = 0
	issue.LastEvaluatedAt = &evaluation.End
	issue.UpdatedAt = evaluation.Now
}

func (issue *Issue) recordClean(evaluation Evaluation) {
	issue.CleanEvaluations++
	issue.LastEvaluatedAt = &evaluation.End
	issue.UpdatedAt = evaluation.Now
}

func (issue *Issue) resolve(now time.Time) {
	issue.Status = StatusResolved
	issue.ResolvedAt = &now
	issue.MutedUntil = nil
	issue.UpdatedAt = now
}

func mostExtreme(current *float64, candidate *float64) *float64 {
	if current == nil || (candidate != nil && math.Abs(*candidate) > math.Abs(*current)) {
		return candidate
	}
	return current
}
