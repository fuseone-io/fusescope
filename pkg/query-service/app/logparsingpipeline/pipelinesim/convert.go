package pipelinesim

import (
	"time"

	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/adapter"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"go.opentelemetry.io/collector/pdata/plog"
)

var severityFromPData = map[plog.SeverityNumber]entry.Severity{
	plog.SeverityNumberUnspecified: entry.Default,
	plog.SeverityNumberTrace:       entry.Trace,
	plog.SeverityNumberTrace2:      entry.Trace2,
	plog.SeverityNumberTrace3:      entry.Trace3,
	plog.SeverityNumberTrace4:      entry.Trace4,
	plog.SeverityNumberDebug:       entry.Debug,
	plog.SeverityNumberDebug2:      entry.Debug2,
	plog.SeverityNumberDebug3:      entry.Debug3,
	plog.SeverityNumberDebug4:      entry.Debug4,
	plog.SeverityNumberInfo:        entry.Info,
	plog.SeverityNumberInfo2:       entry.Info2,
	plog.SeverityNumberInfo3:       entry.Info3,
	plog.SeverityNumberInfo4:       entry.Info4,
	plog.SeverityNumberWarn:        entry.Warn,
	plog.SeverityNumberWarn2:       entry.Warn2,
	plog.SeverityNumberWarn3:       entry.Warn3,
	plog.SeverityNumberWarn4:       entry.Warn4,
	plog.SeverityNumberError:       entry.Error,
	plog.SeverityNumberError2:      entry.Error2,
	plog.SeverityNumberError3:      entry.Error3,
	plog.SeverityNumberError4:      entry.Error4,
	plog.SeverityNumberFatal:       entry.Fatal,
	plog.SeverityNumberFatal2:      entry.Fatal2,
	plog.SeverityNumberFatal3:      entry.Fatal3,
	plog.SeverityNumberFatal4:      entry.Fatal4,
}

func entriesFromPLogs(pl plog.Logs) []*entry.Entry {
	entries := make([]*entry.Entry, 0, pl.LogRecordCount())
	for i := 0; i < pl.ResourceLogs().Len(); i++ {
		rl := pl.ResourceLogs().At(i)
		for j := 0; j < rl.ScopeLogs().Len(); j++ {
			sl := rl.ScopeLogs().At(j)
			for k := 0; k < sl.LogRecords().Len(); k++ {
				e := entryFromRecord(sl.LogRecords().At(k))
				e.Resource = rl.Resource().Attributes().AsRaw()
				e.ScopeName = sl.Scope().Name()
				entries = append(entries, e)
			}
		}
	}
	return entries
}

func entryFromRecord(record plog.LogRecord) *entry.Entry {
	e := &entry.Entry{
		Severity:     severityFromPData[record.SeverityNumber()],
		SeverityText: record.SeverityText(),
		Attributes:   record.Attributes().AsRaw(),
		Body:         record.Body().AsRaw(),
	}
	if record.Timestamp() != 0 {
		e.Timestamp = record.Timestamp().AsTime()
	}
	if record.ObservedTimestamp() != 0 {
		e.ObservedTimestamp = record.ObservedTimestamp().AsTime()
	} else {
		e.ObservedTimestamp = time.Now()
	}
	if traceID := record.TraceID(); !traceID.IsEmpty() {
		e.TraceID = traceID[:]
	}
	if spanID := record.SpanID(); !spanID.IsEmpty() {
		e.SpanID = spanID[:]
	}
	if flags := record.Flags(); flags != 0 {
		e.TraceFlags = []byte{byte(flags)}
	}
	return e
}

// plogsFromEntries converts entries back to pdata as the collector does:
// nil values inside attributes, resource and body maps become the string
// "<nil>", and trace and span IDs shorter than their size are right-aligned.
func plogsFromEntries(entries []*entry.Entry) plog.Logs {
	for _, e := range entries {
		e.Attributes = nilsAsText(e.Attributes)
		e.Resource = nilsAsText(e.Resource)
		if e.Body != nil {
			e.Body = nilAsText(e.Body)
		}
		e.TraceID = rightAligned(e.TraceID, 16)
		e.SpanID = rightAligned(e.SpanID, 8)
	}
	return adapter.ConvertEntries(entries)
}

func nilsAsText(m map[string]any) map[string]any {
	for k, v := range m {
		m[k] = nilAsText(v)
	}
	return m
}

func nilAsText(value any) any {
	switch v := value.(type) {
	case nil:
		return "<nil>"
	case map[string]any:
		return nilsAsText(v)
	case []any:
		for i, item := range v {
			v[i] = nilAsText(item)
		}
		return v
	default:
		return v
	}
}

func rightAligned(id []byte, size int) []byte {
	if id == nil || len(id) >= size {
		return id
	}
	aligned := make([]byte, size)
	copy(aligned[size-len(id):], id)
	return aligned
}
