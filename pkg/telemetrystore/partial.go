package telemetrystore

// The categories a partial result is reported under. The engine's own text never reaches a
// response or a metric label; a reason it adds later is PartialUnknown until it has a category.
const (
	PartialIngesterUnavailable = "ingester_unavailable"
	PartialUnknown             = "unknown"
)

var partialText = map[string]string{
	PartialIngesterUnavailable: "Some recent data may be missing: an engine ingester did not answer.",
	PartialUnknown:             "Some data may be missing: the engine answered in part.",
}

// PartialWarning is the user-facing text of a partial-result category.
func PartialWarning(category string) string {
	if text, ok := partialText[category]; ok {
		return text
	}
	return partialText[PartialUnknown]
}
