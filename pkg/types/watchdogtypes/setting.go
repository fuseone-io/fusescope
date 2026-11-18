package watchdogtypes

import (
	"time"

	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Setting is one detector's switches in an organization. Without a stored
// row a detector is enabled and does not notify.
type Setting struct {
	bun.BaseModel `bun:"table:watchdog_setting,alias:watchdog_setting"`

	types.Identifiable
	types.TimeAuditable
	OrgID    valuer.UUID `bun:"org_id" json:"orgId" required:"true"`
	Detector Detector    `bun:"detector" json:"detector" required:"true"`
	Enabled  bool        `bun:"enabled" json:"enabled" required:"true"`
	Notify   bool        `bun:"notify" json:"notify" required:"true"`
}

func NewDefaultSetting(orgID valuer.UUID, detector Detector) *Setting {
	now := time.Now().UTC()
	return &Setting{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		OrgID:         orgID,
		Detector:      detector,
		Enabled:       true,
		Notify:        false,
	}
}

func (setting *Setting) Validate() error {
	_, err := NewDetector(setting.Detector.StringValue())
	return err
}
