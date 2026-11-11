package parityrun

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
)

var ErrCodeHealthSource = errors.MustNewCode("parity_health_source")

// maxPrometheusAnswer caps the answer of one query the health source reads.
const maxPrometheusAnswer = 16 << 20

// labelValue is what an instance or exporter name may be to be written into a selector.
var labelValue = regexp.MustCompile(`^[A-Za-z0-9_./:-]+$`)

// PrometheusHealthConfig names the staging Prometheus, its token file, the label naming a collector
// instance, the exporters of the dual write (ClickHouse's and the engine's) and the instances the
// tenants file maps tenants to.
type PrometheusHealthConfig struct {
	URL           string
	TokenFile     string
	InstanceLabel string
	Exporters     []string
	Instances     []string
}

// PrometheusHealth reads the collector's exporter failures from Prometheus, a minute at a time: a
// send or enqueue failure of either exporter, or a ClickHouse insert error, leaves its instance's
// minute out, and so does a minute with no up sample or up == 0. A failure series that does not
// exist is no failure, since the collector creates it on the first one.
type PrometheusHealth struct {
	cfg    PrometheusHealthConfig
	client *http.Client
}

// NewPrometheusHealth is a health source over the Prometheus HTTP API; client may be nil.
//
// # Errors
//
// A URL that is not https, no token file or instance label, fewer than two exporters, no
// instance, or a name that cannot be written into a selector.
func NewPrometheusHealth(cfg PrometheusHealthConfig, client *http.Client) (PrometheusHealth, error) {
	u, err := url.Parse(cfg.URL)
	valid := err == nil && u.Scheme == "https" && u.Host != "" && cfg.TokenFile != "" && labelValue.MatchString(cfg.InstanceLabel) && len(cfg.Exporters) >= 2 && len(cfg.Instances) > 0
	for _, name := range append(append([]string(nil), cfg.Exporters...), cfg.Instances...) {
		valid = valid && labelValue.MatchString(name)
	}
	if !valid {
		return PrometheusHealth{}, errors.Newf(errors.TypeInvalidInput, ErrCodeHealthSource, "the health source needs an https Prometheus, a token, an instance label, both dual-write exporters and the collector instances")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return PrometheusHealth{cfg: cfg, client: client}, nil
}

func alternation(names []string) string {
	quoted := make([]string, len(names))
	for i, n := range names {
		quoted[i] = regexp.QuoteMeta(n)
	}
	return strings.Join(quoted, "|")
}

// Failures are the instance minutes of [start, end) the dual write may have failed in.
//
// # Errors
//
// A token that cannot be read, or a query Prometheus did not answer.
func (h PrometheusHealth) Failures(ctx context.Context, start, end time.Time) ([]parity.ExporterFailure, error) {
	label, instances, exporters := h.cfg.InstanceLabel, alternation(h.cfg.Instances), alternation(h.cfg.Exporters)
	counters := map[string]parity.FailureReason{
		`sum by (` + label + `, exporter) (increase(otelcol_exporter_send_failed_spans{exporter=~"` + exporters + `"}[1m]))`:    parity.ReasonSendFailed,
		`sum by (` + label + `, exporter) (increase(otelcol_exporter_enqueue_failed_spans{exporter=~"` + exporters + `"}[1m]))`: parity.ReasonQueueFull,
		`sum by (` + label + `) (increase(otelcol_exporter_fusescope_clickhouse_insert_errors[1m]))`:                            parity.ReasonSendFailed,
	}
	seen := map[parity.ExporterFailure]bool{}
	var out []parity.ExporterFailure
	add := func(f parity.ExporterFailure) {
		if !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	known := map[string]bool{}
	for _, i := range h.cfg.Instances {
		known[i] = true
	}
	step := int64(time.Minute)
	for query, reason := range counters {
		series, err := h.query(ctx, query, start, end)
		if err != nil {
			return nil, err
		}
		for _, s := range series {
			if !known[s.instance] {
				continue
			}
			for ts, v := range s.values {
				if v > 0 {
					add(parity.ExporterFailure{Instance: s.instance, Minute: ts - step, Reason: reason})
					add(parity.ExporterFailure{Instance: s.instance, Minute: ts, Reason: reason})
				}
			}
		}
	}
	observed, err := h.query(ctx, `max by (`+label+`) (up{`+label+`=~"`+instances+`"})`, start, end)
	if err != nil {
		return nil, err
	}
	upAt := map[string]map[int64]float64{}
	for _, s := range observed {
		upAt[s.instance] = s.values
	}
	for _, instance := range h.cfg.Instances {
		for minute := start.UnixNano(); minute < end.UnixNano(); minute += step {
			if v, ok := upAt[instance][minute]; !ok || v == 0 {
				add(parity.ExporterFailure{Instance: instance, Minute: minute, Reason: parity.ReasonUnobserved})
			}
		}
	}
	return out, nil
}

type promSeriesValues struct {
	instance string
	values   map[int64]float64
}

func (h PrometheusHealth) query(ctx context.Context, query string, start, end time.Time) ([]promSeriesValues, error) {
	token, err := os.ReadFile(h.cfg.TokenFile)
	if err != nil || strings.TrimSpace(string(token)) == "" {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeHealthSource, "the Prometheus token is missing")
	}
	params := url.Values{"query": {query}, "start": {strconv.FormatInt(start.Unix(), 10)}, "end": {strconv.FormatInt(end.Add(-time.Minute).Unix(), 10)}, "step": {"60"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(h.cfg.URL, "/")+"/api/v1/query_range?"+params.Encode(), nil)
	if err != nil {
		return nil, errors.WrapInternalf(err, ErrCodeHealthSource, "error building a health query")
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeHealthSource, "Prometheus did not answer a health query")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxPrometheusAnswer))
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeHealthSource, "Prometheus refused a health query")
	}
	var answer struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Values [][2]any          `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &answer); err != nil || answer.Status != "success" {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeHealthSource, "a health answer does not decode")
	}
	out := make([]promSeriesValues, 0, len(answer.Data.Result))
	for _, r := range answer.Data.Result {
		s := promSeriesValues{instance: r.Metric[h.cfg.InstanceLabel], values: map[int64]float64{}}
		for _, pair := range r.Values {
			ts, okTS := pair[0].(float64)
			text, okV := pair[1].(string)
			v, err := strconv.ParseFloat(text, 64)
			if !okTS || !okV || err != nil {
				return nil, errors.Newf(errors.TypeInternal, ErrCodeHealthSource, "a health sample does not decode")
			}
			s.values[int64(ts)*int64(time.Second)] = v
		}
		out = append(out, s)
	}
	return out, nil
}
