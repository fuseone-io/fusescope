package watchdogtypes

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// EvidenceVersion is a contract: a reader of version N must keep decoding
// the rows written with it.
const EvidenceVersion = 1

const maxEvidenceBuckets = 3

var (
	ErrCodeInvalidEvidence = errors.MustNewCode("watchdog_invalid_evidence")
)

// Evidence is what an issue shows of its latest anomalous evaluation: the
// current window only, never the baseline points.
type Evidence struct {
	Version  int              `json:"version" required:"true"`
	Buckets  []EvidenceBucket `json:"buckets" required:"true" nullable:"true"`
	Score    float64          `json:"score" required:"true"`
	Query    json.RawMessage  `json:"query,omitempty"`
	Warnings []string         `json:"warnings" required:"true" nullable:"true"`
	GroupID  string           `json:"groupId,omitempty"`
}

// EvidenceBucket leaves a field nil where the bucket had no value or the
// scorer no prediction.
type EvidenceBucket struct {
	Timestamp  time.Time `json:"timestamp" required:"true"`
	Value      *float64  `json:"value"`
	Prediction *float64  `json:"prediction"`
	Lower      *float64  `json:"lower"`
	Upper      *float64  `json:"upper"`
	Score      *float64  `json:"score"`
}

func (evidence Evidence) Validate() error {
	if evidence.Version != EvidenceVersion {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvidence, "unsupported evidence version %d", evidence.Version)
	}
	if len(evidence.Buckets) > maxEvidenceBuckets {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvidence, "evidence holds %d buckets, at most %d", len(evidence.Buckets), maxEvidenceBuckets)
	}
	return nil
}

func (evidence Evidence) Value() (driver.Value, error) {
	data, err := json.Marshal(evidence)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeInvalidEvidence, "couldn't encode the evidence")
	}
	return string(data), nil
}

func (evidence *Evidence) Scan(src any) error {
	var data []byte
	switch value := src.(type) {
	case string:
		data = []byte(value)
	case []byte:
		data = value
	default:
		return errors.Newf(errors.TypeInternal, ErrCodeInvalidEvidence, "evidence: unsupported column type %T", src)
	}
	if err := json.Unmarshal(data, evidence); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, ErrCodeInvalidEvidence, "couldn't decode the evidence")
	}
	return nil
}
