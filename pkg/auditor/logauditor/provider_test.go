package logauditor

import (
	"bytes"
	"context"
	"log/slog"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/types/audittypes"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

func TestAuditFlushesSafePublicAccessLog(t *testing.T) {
	var output bytes.Buffer
	settings := factorytest.NewSettings()
	settings.Logger = slog.New(slog.NewJSONHandler(&output, nil))
	config := auditor.Config{BufferSize: 10, BatchSize: 10, FlushInterval: time.Hour}
	p, err := New(context.Background(), settings, config)
	require.NoError(t, err)
	done := make(chan error, 1)
	go func() { done <- p.Start(context.Background()) }()
	<-p.Healthy()
	orgID := valuer.GenerateUUID()
	req := httptest.NewRequest("GET", "/api/v2/public/dashboards/secret-public-link?variables=secret-value", nil)
	event := audittypes.NewAuditEventFromHTTPRequest(req, "/api/v2/public/dashboards/{id}", 200, trace.TraceID{}, trace.SpanID{}, coretypes.VerbRead, coretypes.ActionCategoryDataAccess, authtypes.Claims{OrgID: orgID.StringValue()}, audittypes.NewResourceAttributes(coretypes.ResourceMetaResourcePublicDashboard, "secret-public-link"), "", "")
	p.Audit(context.Background(), event)
	require.NoError(t, p.Stop(context.Background()))
	require.NoError(t, <-done)
	log := output.String()
	assert.Contains(t, log, "public-dashboard.read")
	assert.Contains(t, log, orgID.StringValue())
	assert.Contains(t, log, "signoz.audit.outcome")
	assert.NotContains(t, log, "secret-public-link")
	assert.NotContains(t, log, "secret-value")
}
