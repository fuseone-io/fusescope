package watchdogtypes

import (
	"encoding/json"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	ErrCodeUnknownDetector = errors.MustNewCode("watchdog_unknown_detector")
)

// Detector names are persisted API values and never change after release.
var (
	DetectorErrorRate      = Detector{valuer.NewString("error_rate")}
	DetectorLatencyP99     = Detector{valuer.NewString("latency_p99")}
	DetectorThroughputDrop = Detector{valuer.NewString("throughput_drop")}
	DetectorNewException   = Detector{valuer.NewString("new_exception")}
)

type Detector struct{ valuer.String }

func NewDetector(name string) (Detector, error) {
	detector := Detector{valuer.NewString(name)}
	if !detector.IsValid() {
		return Detector{}, errors.Newf(errors.TypeInvalidInput, ErrCodeUnknownDetector, "unknown watchdog detector %q", name)
	}
	return detector, nil
}

func (Detector) Enum() []any {
	return []any{DetectorErrorRate, DetectorLatencyP99, DetectorThroughputDrop, DetectorNewException}
}

func (detector Detector) IsValid() bool {
	return slices.Contains(detector.Enum(), any(detector))
}

// IsRED reports whether the detector watches a rate, error or duration
// series; only those issues resolve on their own.
func (detector Detector) IsRED() bool {
	return detector.IsValid() && detector != DetectorNewException
}

func (detector *Detector) UnmarshalJSON(data []byte) error {
	var name string
	if err := json.Unmarshal(data, &name); err != nil {
		return err
	}
	parsed, err := NewDetector(name)
	if err != nil {
		return err
	}
	*detector = parsed
	return nil
}
