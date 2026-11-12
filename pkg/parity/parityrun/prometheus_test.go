package parityrun

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/parity"
)

var promStart = time.Unix(1_700_000_040, 0)

type promSeries struct {
	labels map[string]string
	values map[int64]float64 // by unix second
}

// prometheus answers query_range with the series of the first matching metric in its query.
func prometheusFake(t *testing.T, series map[string][]promSeries, status int) (*httptest.Server, *[]string) {
	t.Helper()
	var queries []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/query_range", r.URL.Path)
		assert.Equal(t, "Bearer prom-token", r.Header.Get("Authorization"))
		q := r.URL.Query().Get("query")
		queries = append(queries, q)
		if status != http.StatusOK {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
			return
		}
		var result []map[string]any
		for metric, list := range series {
			if !strings.Contains(q, metric) {
				continue
			}
			for _, s := range list {
				var values [][]any
				for ts, v := range s.values {
					values = append(values, []any{ts, strconvFloat(v)})
				}
				result = append(result, map[string]any{"metric": s.labels, "values": values})
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": map[string]any{"resultType": "matrix", "result": result}})
	}))
	t.Cleanup(server.Close)
	return server, &queries
}

func strconvFloat(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "+Inf"
	case math.IsInf(v, -1):
		return "-Inf"
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func health(t *testing.T, server *httptest.Server) PrometheusHealth {
	t.Helper()
	token := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(token, []byte("prom-token"), 0o600))
	h, err := NewPrometheusHealth(PrometheusHealthConfig{URL: server.URL, TokenFile: token, InstanceLabel: "pod",
		Exporters: []string{"fusescope_clickhouse", "otlp_grpc/engine"}, Instances: []string{"c-0", "c-1"}}, server.Client())
	require.NoError(t, err)
	return h
}

func up(pod string, minutes ...int64) promSeries {
	values := map[int64]float64{}
	for _, m := range minutes {
		values[promStart.Unix()+60*m] = 1
	}
	return promSeries{labels: map[string]string{"pod": pod}, values: values}
}

func TestAFailedExportInvalidatesItsInstancesMinute(t *testing.T) {
	server, queries := prometheusFake(t, map[string][]promSeries{
		"up": {up("c-0", 0, 1, 2), up("c-1", 0, 1, 2)},
		"otelcol_exporter_send_failed_spans": {
			{labels: map[string]string{"pod": "c-1", "exporter": "otlp_grpc/engine"}, values: map[int64]float64{promStart.Unix() + 60: 3}},
			{labels: map[string]string{"pod": "c-9", "exporter": "otlp_grpc/engine"}, values: map[int64]float64{promStart.Unix() + 60: 3}},
		},
	}, http.StatusOK)
	got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(3*time.Minute))
	require.NoError(t, err)
	assert.ElementsMatch(t, []parity.ExporterFailure{
		{Instance: "c-1", Minute: promStart.UnixNano(), Reason: parity.ReasonSendFailed},
		{Instance: "c-1", Minute: promStart.Add(time.Minute).UnixNano(), Reason: parity.ReasonSendFailed},
	}, got, "an increase over (t - 1m, t] may belong to either minute: both are left out")
	var sawEnqueue, sawInsert bool
	for _, q := range *queries {
		sawEnqueue = sawEnqueue || strings.Contains(q, "otelcol_exporter_enqueue_failed_spans")
		sawInsert = sawInsert || strings.Contains(q, "otelcol_exporter_fusescope_clickhouse_insert_errors")
	}
	assert.True(t, sawEnqueue && sawInsert)
}

func TestAMinuteWithoutAnObservationIsUnobserved(t *testing.T) {
	down := up("c-1", 0, 2)
	down.values[promStart.Unix()+60] = 0
	server, _ := prometheusFake(t, map[string][]promSeries{"up": {up("c-0", 0, 2), down}}, http.StatusOK)
	got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(3*time.Minute))
	require.NoError(t, err)
	assert.ElementsMatch(t, []parity.ExporterFailure{
		{Instance: "c-0", Minute: promStart.Add(time.Minute).UnixNano(), Reason: parity.ReasonUnobserved},
		{Instance: "c-1", Minute: promStart.Add(time.Minute).UnixNano(), Reason: parity.ReasonUnobserved},
	}, got, "a missing sample and up == 0 alike")
}

func TestAFailingPrometheusIsAnError(t *testing.T) {
	server, _ := prometheusFake(t, nil, http.StatusServiceUnavailable)
	_, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(time.Minute))
	assert.Error(t, err, "never healthy")
}

func TestAHealthSourceIsConfiguredWhole(t *testing.T) {
	good := PrometheusHealthConfig{URL: "https://prom", TokenFile: "/t", InstanceLabel: "pod", Exporters: []string{"fusescope_clickhouse", "otlp_grpc/engine"}, Instances: []string{"c-0"}}
	for name, change := range map[string]func(*PrometheusHealthConfig){
		"plain http":     func(c *PrometheusHealthConfig) { c.URL = "http://prom" },
		"no token":       func(c *PrometheusHealthConfig) { c.TokenFile = "" },
		"one exporter":   func(c *PrometheusHealthConfig) { c.Exporters = []string{"fusescope_clickhouse"} },
		"no instances":   func(c *PrometheusHealthConfig) { c.Instances = nil },
		"no label":       func(c *PrometheusHealthConfig) { c.InstanceLabel = "" },
		"a quoted label": func(c *PrometheusHealthConfig) { c.Exporters = []string{`a"b`, "x"} },
	} {
		c := good
		change(&c)
		_, err := NewPrometheusHealth(c, nil)
		assert.Error(t, err, name)
	}
}

func observedAs(t *testing.T, values ...float64) []parity.ExporterFailure {
	t.Helper()
	series := promSeries{labels: map[string]string{"pod": "c-0"}, values: map[int64]float64{}}
	for i, v := range values {
		series.values[promStart.Unix()+60*int64(i)] = v
	}
	server, queries := prometheusFake(t, map[string][]promSeries{"up": {series, up("c-1", 0, 1, 2, 3, 4)}}, http.StatusOK)
	got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(time.Duration(len(values))*time.Minute))
	require.NoError(t, err)
	for _, q := range *queries {
		if strings.Contains(q, "up{") {
			assert.True(t, strings.HasPrefix(q, "up{"), "every series, unaggregated, so no sample is hidden: %s", q)
		}
	}
	return got
}

func TestOnlyAnUpOfExactlyOneIsObserved(t *testing.T) {
	got := observedAs(t, 1, math.NaN(), math.Inf(1), -1, 0.5)
	var unobserved []int64
	for _, f := range got {
		if f.Instance == "c-0" {
			unobserved = append(unobserved, (f.Minute-promStart.UnixNano())/int64(time.Minute))
		}
	}
	assert.ElementsMatch(t, []int64{1, 2, 3, 4}, unobserved, "NaN, infinity, a negative and a fraction are not up")
}

func TestTwoUpSeriesOfOneInstanceMustBothBeOne(t *testing.T) {
	server, _ := prometheusFake(t, map[string][]promSeries{"up": {{labels: map[string]string{"pod": "c-0"}, values: map[int64]float64{promStart.Unix(): 0}}, up("c-0", 0), up("c-1", 0)}}, http.StatusOK)
	got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(time.Minute))
	require.NoError(t, err)
	assert.Equal(t, []parity.ExporterFailure{{Instance: "c-0", Minute: promStart.UnixNano(), Reason: parity.ReasonUnobserved}}, got)
}

func TestACounterThatIsNotANumberIsAFailure(t *testing.T) {
	for _, v := range []float64{math.NaN(), math.Inf(1), -1} {
		server, _ := prometheusFake(t, map[string][]promSeries{
			"up":                                    {up("c-0", 0, 1), up("c-1", 0, 1)},
			"otelcol_exporter_enqueue_failed_spans": {{labels: map[string]string{"pod": "c-0", "exporter": "otlp_grpc/engine"}, values: map[int64]float64{promStart.Unix() + 60: v}}},
		}, http.StatusOK)
		got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(2*time.Minute))
		require.NoError(t, err)
		assert.NotEmpty(t, got, "%v is no proof the export went through", v)
	}
}

func TestTheExportersAreDistinct(t *testing.T) {
	_, err := NewPrometheusHealth(PrometheusHealthConfig{URL: "https://prom", TokenFile: "/t", InstanceLabel: "pod", Exporters: []string{"otlp_grpc/engine", "otlp_grpc/engine"}, Instances: []string{"c-0"}}, nil)
	assert.Error(t, err)
}

func TestAnyUpSampleOtherThanOneLeavesTheMinuteOut(t *testing.T) {
	for _, other := range []float64{math.Inf(1), 2} {
		server, _ := prometheusFake(t, map[string][]promSeries{"up": {
			up("c-0", 0),
			{labels: map[string]string{"pod": "c-0"}, values: map[int64]float64{promStart.Unix(): other}},
			up("c-1", 0),
		}}, http.StatusOK)
		got, err := health(t, server).Failures(t.Context(), promStart, promStart.Add(time.Minute))
		require.NoError(t, err)
		assert.Equal(t, []parity.ExporterFailure{{Instance: "c-0", Minute: promStart.UnixNano(), Reason: parity.ReasonUnobserved}}, got, "[1, %v]: every sample must be exactly 1", other)
	}
}
