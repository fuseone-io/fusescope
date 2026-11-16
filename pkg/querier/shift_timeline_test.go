package querier

import (
	"context"
	"sync"
	"testing"
	"time"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/metrictypes"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes/telemetrytypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// rangeRecorder builds a fixed statement and records the window of each one it builds.
type rangeRecorder struct {
	mu     sync.Mutex
	ranges []qbtypes.TimeRange
}

func (r *rangeRecorder) Build(_ context.Context, _ valuer.UUID, start, end uint64, _ qbtypes.RequestType, _ qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation], _ map[string]qbtypes.VariableItem) (*qbtypes.Statement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ranges = append(r.ranges, qbtypes.TimeRange{From: start, To: end})
	return &qbtypes.Statement{Query: "SELECT ts, value FROM signoz_metrics"}, nil
}

func (r *rangeRecorder) take() []qbtypes.TimeRange {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := r.ranges
	r.ranges = nil
	return out
}

// A point read at t − S by a query shifted by S comes back at t, whether the window was read
// whole or partly from the bucket cache, and ClickHouse is asked only for the missing range,
// shifted once: anomaly baselines rely on both.
func TestTimeShiftResultsLandOnTheCurrentTimeline(t *testing.T) {
	const shift = 24 * time.Hour
	end := time.Now().Add(-72 * time.Hour).Truncate(time.Minute)
	start := end.Add(-30 * time.Minute)
	valueAt := func(ts time.Time) float64 { return float64(ts.Unix() / 60 % 1000) }

	metadataStore := telemetrytypestest.NewMockMetadataStore()
	metadataStore.TypeMap["requests"] = metrictypes.GaugeType
	store := telemetrystoretest.New(telemetrystore.Config{}, &queryMatcherAny{})
	expectRows := func(from, to time.Time) {
		var rows [][]any
		for ts := from; ts.Before(to); ts = ts.Add(time.Minute) {
			rows = append(rows, []any{ts.Add(-shift), valueAt(ts)})
		}
		store.Mock().ExpectQuery("SELECT").WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "ts", Type: "DateTime"}, {Name: "value", Type: "Float64"}}, rows))
	}
	recorder := &rangeRecorder{}
	q := New(instrumentationtest.New().ToProviderSettings(), store, metadataStore, nil, nil, nil, nil, nil, recorder, nil, nil, createTestBucketCache(t), flaggertest.New(t), 0, 0)
	shifted := func(from, to time.Time) qbtypes.TimeRange {
		return qbtypes.TimeRange{From: uint64(from.Add(-shift).UnixMilli()), To: uint64(to.Add(-shift).UnixMilli())}
	}
	org := valuer.GenerateUUID()
	request := func(from, to time.Time) *qbtypes.QueryRangeRequest {
		return &qbtypes.QueryRangeRequest{
			Start:       uint64(from.UnixMilli()),
			End:         uint64(to.UnixMilli()),
			RequestType: qbtypes.RequestTypeTimeSeries,
			CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{
				Type: qbtypes.QueryTypeBuilder,
				Spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
					Name:         "A",
					Signal:       telemetrytypes.SignalMetrics,
					StepInterval: qbtypes.Step{Duration: time.Minute},
					Aggregations: []qbtypes.MetricAggregation{{MetricName: "requests", TimeAggregation: metrictypes.TimeAggregationAvg, SpaceAggregation: metrictypes.SpaceAggregationAvg}},
					Functions:    []qbtypes.Function{{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: int64(shift / time.Second)}}}},
				},
			}}},
		}
	}
	assertTimeline := func(t *testing.T, resp *qbtypes.QueryRangeResponse, from, to time.Time) {
		t.Helper()
		require.Len(t, resp.Data.Results, 1)
		data := resp.Data.Results[0].(*qbtypes.TimeSeriesData)
		require.Len(t, data.Aggregations, 1)
		require.Len(t, data.Aggregations[0].Series, 1)
		got := map[int64]float64{}
		for _, v := range data.Aggregations[0].Series[0].Values {
			got[v.Timestamp] = v.Value
		}
		want := map[int64]float64{}
		for ts := from; ts.Before(to); ts = ts.Add(time.Minute) {
			want[ts.UnixMilli()] = valueAt(ts)
		}
		assert.Equal(t, want, got)
	}

	t.Run("Miss", func(t *testing.T) {
		expectRows(start, end)
		resp, err := q.QueryRange(context.Background(), org, request(start, end))
		require.NoError(t, err)
		assertTimeline(t, resp, start, end)
		assert.Equal(t, []qbtypes.TimeRange{shifted(start, end)}, recorder.take())
	})
	t.Run("PartialHit", func(t *testing.T) {
		later := 10 * time.Minute
		expectRows(end, end.Add(later))
		resp, err := q.QueryRange(context.Background(), org, request(start.Add(later), end.Add(later)))
		require.NoError(t, err)
		assertTimeline(t, resp, start.Add(later), end.Add(later))
		assert.Equal(t, []qbtypes.TimeRange{shifted(end, end.Add(later))}, recorder.take())
		assert.NoError(t, store.Mock().ExpectationsWereMet())
	})
}
