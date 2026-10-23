package retentiontypes

// TTLTypes lists the signals a retention can be set on.
var TTLTypes = []string{LogsTTL, TraceTTL, MetricsTTL}

// ShouldApplyDefaultRetention reports whether a configured default applies: only to a signal
// that never had a retention requested, so a value set in the UI is never overridden.
func ShouldApplyDefaultRetention(defaultDays int, hasTTLSetting bool) bool {
	return defaultDays > 0 && !hasTTLSetting
}

// NewDefaultTTLParams builds the v1 request the settings page sends for traces and metrics.
func NewDefaultTTLParams(ttlType string, days int) *TTLParams {
	return &TTLParams{Type: ttlType, DelDuration: int64(days) * secondsPerDay}
}

// NewDefaultCustomRetentionTTLParams builds the v2 request the settings page sends for logs.
func NewDefaultCustomRetentionTTLParams(days int) *CustomRetentionTTLParams {
	return &CustomRetentionTTLParams{Type: LogsTTL, DefaultTTLDays: days, TTLConditions: []CustomRetentionRule{}}
}
