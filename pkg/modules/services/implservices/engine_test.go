package implservices

import (
	"context"

	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"

	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/querier/queriertest"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var engineOrg = valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000001")

// engineStore answers Query as the engine; its ClickHouse fails the test on any statement it was
// not told to expect.
type engineStore struct {
	*telemetrystoretest.Provider
	statements []string
	routes     []telemetrystore.Route
	tenants    []string
	partial    []string
}

func (s *engineStore) Query(ctx context.Context, stmt string, _ ...any) (telemetrystore.Rows, error) {
	s.statements = append(s.statements, stmt)
	s.routes = append(s.routes, telemetrystore.RouteFromContext(ctx))
	if identity, err := telemetrystore.IdentityFromContext(ctx); err == nil {
		s.tenants = append(s.tenants, identity.Tenant.StringValue())
	}
	rows := cmock.NewRows([]cmock.ColumnType{{Name: "name", Type: "String"}, {Name: "service_name", Type: "String"}, {Name: "ts", Type: "DateTime64(9)"}},
		[][]any{{"GET /cart", "svc-a", time.Unix(20, 0)}, {"consume", "svc-a", time.Unix(10, 0)}})
	return partialRows{Rows: clickhousetelemetrystore.NewRows(rows), partial: s.partial}, nil
}

type partialRows struct {
	telemetrystore.Rows
	partial []string
}

func (r partialRows) Warnings() []string { return r.partial }

func servicesResponse() *qbtypes.QueryRangeResponse {
	group := &qbtypes.ColumnDescriptor{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Type: qbtypes.ColumnTypeGroup}
	agg := func(idx int64) *qbtypes.ColumnDescriptor {
		return &qbtypes.ColumnDescriptor{AggregationIndex: idx, Type: qbtypes.ColumnTypeAggregation}
	}
	return &qbtypes.QueryRangeResponse{
		Type: qbtypes.RequestTypeScalar,
		Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{
			QueryName: "A",
			Columns:   []*qbtypes.ColumnDescriptor{group, agg(0), agg(1), agg(2), agg(3), agg(4)},
			Data:      [][]any{{"svc-a", float64(123), float64(45), uint64(10), uint64(2), uint64(1)}},
		}}},
		Warning: &qbtypes.QueryWarnData{Warnings: []qbtypes.QueryWarnDataAdditional{
			{Message: telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)},
		}},
	}
}

func servicesRequest() *servicetypesv1.Request {
	return &servicetypesv1.Request{Start: "1747947419000000000", End: "1747983448000000000"}
}

func newServices(t *testing.T, serves bool) (*module, *engineStore) {
	store := &engineStore{Provider: telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp)}
	q := queriertest.NewMockQuerier()
	q.QueryRangeFunc = func(context.Context, valuer.UUID, *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		return servicesResponse(), nil
	}
	m := NewModule(q, store, func(route telemetrystore.Route, org valuer.UUID) bool {
		return serves && route == telemetrystore.RouteTracesAggregate && org == engineOrg
	}).(*module)
	t.Cleanup(func() {
		assert.NoError(t, store.Mock().ExpectationsWereMet(), "ClickHouse got only what it was told to expect")
	})
	return m, store
}

func TestTheServicesOfAnEngineOrgReadTheirTopLevelOperationsFromTheEngine(t *testing.T) {
	m, store := newServices(t, true)
	store.partial = []string{telemetrystore.PartialIngesterUnavailable}

	items, warnings, err := m.Get(serviceContext(), engineOrg, servicesRequest())
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, []string{"overflow_operation", "GET /cart", "consume"}, items[0].DataWarning.TopLevelOps)
	assert.Equal(t, []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}, warnings, "the querier's and the engine's warning, once")

	want, err := tracestelemetryschema.DataFusionTopLevelOperations(time.UnixMilli(1747947419000).UTC(), []string{"svc-a"})
	require.NoError(t, err)
	assert.Equal(t, []string{want}, store.statements)
	assert.Equal(t, []telemetrystore.Route{telemetrystore.RouteTracesAggregate}, store.routes)
	assert.Equal(t, []string{engineOrg.StringValue()}, store.tenants)
}

func TestTheServicesOfAnotherOrgReadClickhouse(t *testing.T) {
	m, store := newServices(t, false)
	store.Mock().ExpectQuery("distributed_top_level_operations").WithArgs(clickhouse.Named("start", time.UnixMilli(1747947419000).UTC()), clickhouse.Named("services", []string{"svc-a"})).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "name", Type: "String"}, {Name: "serviceName", Type: "String"}, {Name: "ts", Type: "DateTime"}},
		[][]any{{"GET /cart", "svc-a", time.Unix(20, 0)}},
	))
	items, warnings, err := m.Get(serviceContext(), engineOrg, servicesRequest())
	require.NoError(t, err)
	assert.Equal(t, []string{"overflow_operation", "GET /cart"}, items[0].DataWarning.TopLevelOps)
	assert.Empty(t, store.statements)
	assert.Equal(t, []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}, warnings, "the querier's own warnings pass through")
}

func TestTopOperationsReturnTheQueriersWarnings(t *testing.T) {
	m, _ := newServices(t, true)
	m.Querier.(*queriertest.MockQuerier).QueryRangeFunc = func(context.Context, valuer.UUID, *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		resp := servicesResponse()
		resp.Data = qbtypes.QueryData{}
		return resp, nil
	}
	_, warnings, err := m.GetTopOperations(serviceContext(), engineOrg, &servicetypesv1.OperationsRequest{Service: "svc-a", Start: "1747947419000000000", End: "1747983448000000000", Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}, warnings)
}

func serviceContext() context.Context {
	return telemetrystore.WithService(context.Background(), "services-test")
}
