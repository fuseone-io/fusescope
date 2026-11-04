package ingesttypes

import (
	"time"

	"github.com/uptrace/bun"
)

// StorableReportAgent is the persisted per-agent record of the ingest
// report (the collector's docs/spec/rum.md §10.4): the last sequence
// applied and the highest invalidated. Sequences are stored as int64, so
// one above the largest int64 is never applied.
type StorableReportAgent struct {
	bun.BaseModel `bun:"table:ingest_report_agent"`

	AgentID     string    `bun:"agent_id,pk"`
	Applied     int64     `bun:"applied"`
	Invalidated int64     `bun:"invalidated"`
	CreatedAt   time.Time `bun:"created_at"`
	UpdatedAt   time.Time `bun:"updated_at"`
}

// StorableReportApplication is one application's window values in the
// last report applied from one agent (§10.2), replaced by each report.
// ReportedAt is when it was applied, at the database's clock; rows older
// than the status window are deleted, which bounds how long the SDK
// strings and the last origin are kept (§10.3).
type StorableReportApplication struct {
	bun.BaseModel `bun:"table:ingest_report_application"`

	ApplicationID string    `bun:"application_id,pk"`
	AgentID       string    `bun:"agent_id,pk"`
	Sessions      int64     `bun:"sessions"`
	Views         int64     `bun:"views"`
	Errors        int64     `bun:"errors"`
	Vitals        int64     `bun:"vitals"`
	SDKName       string    `bun:"sdk_name"`
	SDKVersion    string    `bun:"sdk_version"`
	Rejections    string    `bun:"rejections"`
	ReportedAt    time.Time `bun:"reported_at"`
}

// ReportedRejection is one entry of StorableReportApplication.Rejections,
// a JSON array.
type ReportedRejection struct {
	Reason     string    `json:"reason"`
	Count      int64     `json:"count"`
	LastOrigin string    `json:"lastOrigin"`
	LastSeenAt time.Time `json:"lastSeenAt"`
}
