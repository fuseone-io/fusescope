package watchdogtypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	// ExceptionLookback bounds the read of exception groups: a group silent
	// for longer is new again.
	ExceptionLookback = 7 * 24 * time.Hour
	// ExceptionBatchSize groups are processed per cycle; the read takes one
	// more to tell an overflow.
	ExceptionBatchSize = 100
)

// ExceptionGroup is an exception group by its first occurrence in the
// lookback. Its message is never read.
type ExceptionGroup struct {
	GroupID   string
	Service   string
	Type      string
	FirstSeen time.Time
}

// ExceptionCursor is the last exception group processed, in (FirstSeen,
// GroupID) order. An empty GroupID is past every group first seen at
// FirstSeen.
type ExceptionCursor struct {
	FirstSeen time.Time
	GroupID   string
}

// NewExceptionCursor is past every group first seen at or before end.
func NewExceptionCursor(end time.Time) ExceptionCursor {
	return ExceptionCursor{FirstSeen: end}
}

// NewExceptionEvaluation is the anomalous evaluation opening an issue for a
// new exception group, found in the window.
func NewExceptionEvaluation(orgID valuer.UUID, window Window, group ExceptionGroup, now time.Time) Evaluation {
	firstSeen := group.FirstSeen.UTC()
	return Evaluation{
		OrgID:    orgID,
		Detector: DetectorNewException,
		Service:  group.Service,
		GroupID:  group.GroupID,
		Outcome:  OutcomeAnomalous,
		End:      window.End,
		Evidence: &Evidence{Version: EvidenceVersion, GroupID: group.GroupID, ExceptionType: group.Type, FirstSeen: &firstSeen},
		Now:      now,
	}
}

// ServicesWithHistory are the services of at least one baseline season: the
// ones observed 24 hours or more before the window.
func ServicesWithHistory(seasons []*REDResult) map[string]bool {
	history := map[string]bool{}
	for _, season := range seasons {
		if season == nil {
			continue
		}
		for service := range season.Services {
			history[service] = true
		}
	}
	return history
}
