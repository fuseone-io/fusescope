package parityinvestigate

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeAudit = errors.MustNewCode("parity_investigation_audit")

// maxAuditResponse caps the collector's answer the sink reads.
const maxAuditResponse = 1 << 20

// Phase is where an investigation session is: a started session is closed by one other phase,
// unless the process is lost.
type Phase string

const (
	PhaseStarted     Phase = "started"
	PhaseCompleted   Phase = "completed"
	PhaseInterrupted Phase = "interrupted"
	PhaseFailed      Phase = "failed"
)

// Session is one investigation: who runs it and what it looks at. Its id links its started event
// to its closing one.
type Session struct {
	ID       string
	Operator Operator
	RunID    string
	Tenant   string
	Class    string
	Start    time.Time
	End      time.Time
}

// AuditSink sends an investigation's audit events to the staging audit pipeline over OTLP HTTP,
// synchronously: an event counts only once the collector's answer says it took every record.
type AuditSink struct {
	endpoint  string
	tokenFile string
	client    *http.Client
}

// NewAuditSink is a sink to the OTLP HTTP endpoint, authenticated with the bearer token of
// tokenFile; client may be nil for the default.
//
// # Errors
//
// An endpoint that is not https, or no token file.
func NewAuditSink(endpoint, tokenFile string, client *http.Client) (AuditSink, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" || tokenFile == "" {
		return AuditSink{}, errors.Newf(errors.TypeInvalidInput, ErrCodeAudit, "the audit endpoint is reached over https with a token")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return AuditSink{endpoint: strings.TrimSuffix(endpoint, "/") + "/v1/logs", tokenFile: tokenFile, client: client}, nil
}

// Emit sends the event of phase for s, with the differences shown when it closes the session.
//
// # Errors
//
// An unreadable or empty token, a failed request, or an answer that is not a full success.
func (a AuditSink) Emit(ctx context.Context, s Session, phase Phase, shown int) error {
	token, err := os.ReadFile(a.tokenFile)
	if err != nil || strings.TrimSpace(string(token)) == "" {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeAudit, "the audit token is missing")
	}
	body, err := plogotlp.NewExportRequestFromLogs(auditLogs(s, phase, shown)).MarshalProto()
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeAudit, "error encoding the audit event")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeAudit, "error building the audit request")
	}
	req.Header.Set("Content-Type", "application/x-protobuf")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	resp, err := a.client.Do(req)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeAudit, "the audit event was not sent")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxAuditResponse))
	if err != nil || resp.StatusCode/100 != 2 {
		return errors.Newf(errors.TypeInternal, ErrCodeAudit, "the audit pipeline refused the event")
	}
	answer := plogotlp.NewExportResponse()
	if err := answer.UnmarshalProto(raw); err != nil {
		return errors.Newf(errors.TypeInternal, ErrCodeAudit, "the audit pipeline's answer does not decode")
	}
	if p := answer.PartialSuccess(); p.RejectedLogRecords() > 0 || p.ErrorMessage() != "" {
		return errors.Newf(errors.TypeInternal, ErrCodeAudit, "the audit pipeline did not take the event whole")
	}
	return nil
}

func auditLogs(s Session, phase Phase, shown int) plog.Logs {
	logs := plog.NewLogs()
	resource := logs.ResourceLogs().AppendEmpty()
	resource.Resource().Attributes().PutStr("service.name", "fusescope-parity")
	scope := resource.ScopeLogs().AppendEmpty()
	scope.Scope().SetName("fusescope::audit")
	record := scope.LogRecords().AppendEmpty()
	now := pcommon.NewTimestampFromTime(time.Now())
	record.SetTimestamp(now)
	record.SetObservedTimestamp(now)
	record.SetEventName("parity.investigation." + string(phase))
	record.SetSeverityNumber(plog.SeverityNumberInfo)
	record.Body().SetStr("parity investigation " + string(phase))
	attrs := record.Attributes()
	attrs.PutStr("fusescope.audit.action", "parity.investigate")
	attrs.PutStr("fusescope.audit.session_id", s.ID)
	attrs.PutStr("fusescope.audit.phase", string(phase))
	attrs.PutStr("fusescope.audit.principal.issuer", s.Operator.Issuer)
	attrs.PutStr("fusescope.audit.principal.subject", s.Operator.Subject)
	if s.Operator.Email != "" {
		attrs.PutStr("fusescope.audit.principal.email", s.Operator.Email)
	}
	attrs.PutStr("fusescope.parity.run_id", s.RunID)
	attrs.PutStr("fusescope.parity.tenant", s.Tenant)
	attrs.PutStr("fusescope.parity.window_class", s.Class)
	attrs.PutInt("fusescope.parity.window_start_unix_nano", s.Start.UnixNano())
	attrs.PutInt("fusescope.parity.window_end_unix_nano", s.End.UnixNano())
	if phase != PhaseStarted {
		attrs.PutInt("fusescope.parity.differences_shown", int64(shown))
	}
	return logs
}
