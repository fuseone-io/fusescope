package logauditor

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/auditor/auditorserver"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/audittypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"go.opentelemetry.io/collector/pdata/plog"
)

type provider struct {
	*auditorserver.Server
}

func NewFactory() factory.ProviderFactory[auditor.Auditor, auditor.Config] {
	return factory.NewProviderFactory(factory.MustNewName("log"), New)
}

func New(_ context.Context, settings factory.ProviderSettings, config auditor.Config) (auditor.Auditor, error) {
	scoped := factory.NewScopedProviderSettings(settings, "github.com/fuseone-io/fusescope/pkg/auditor/logauditor")
	server, err := auditorserver.New(scoped, auditorserver.Config{BufferSize: config.BufferSize, BatchSize: config.BatchSize, FlushInterval: config.FlushInterval}, func(ctx context.Context, events []audittypes.AuditEvent) error {
		for _, event := range events {
			logEvent(ctx, scoped.Logger(), event)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &provider{Server: server}, nil
}

func (p *provider) Audit(ctx context.Context, event audittypes.AuditEvent) { p.Add(ctx, event) }

func logEvent(ctx context.Context, logger *slog.Logger, event audittypes.AuditEvent) {
	if event.ResourceAttributes.Resource.Kind() == coretypes.KindPublicDashboard {
		// Public IDs grant access; audit a stable fingerprint rather than the bearer value.
		event.ResourceAttributes.ResourceID = fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(event.ResourceAttributes.ResourceID)))
	}
	event.TransportAttributes.URLPath = event.TransportAttributes.HTTPRoute
	record := plog.NewLogRecord()
	event.ToLogRecord(record)
	fields := record.Attributes().AsRaw()
	resource := event.ResourceAttributes
	fields["signoz.audit.resource.kind"] = resource.Resource.Kind().String()
	fields["signoz.audit.resource.id"] = resource.ResourceID
	if resource.TargetResource != nil {
		fields["signoz.audit.resource.target.kind"] = resource.TargetResource.Kind().String()
		fields["signoz.audit.resource.target.id"] = resource.TargetResourceID
	}
	if event.TraceID.IsValid() {
		fields["trace_id"] = event.TraceID.String()
	}
	if event.SpanID.IsValid() {
		fields["span_id"] = event.SpanID.String()
	}
	logger.InfoContext(ctx, "audit event", slog.String("event_name", event.EventName.String()), slog.Time("audit_timestamp", event.Timestamp), slog.Any("audit", fields))
}
