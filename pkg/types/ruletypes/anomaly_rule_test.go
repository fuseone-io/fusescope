package ruletypes

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// anomalyRuleJSON is a valid v1 anomaly rule; replace swaps fragments of it.
func anomalyRuleJSON(replace ...string) string {
	rule := `{
		"alert": "RequestsAnomaly",
		"version": "v5",
		"ruleType": "anomaly_rule",
		"evalWindow": "30m",
		"frequency": "5m",
		"condition": {
			"compositeQuery": {
				"queryType": "builder",
				"unit": "bytes",
				"queries": [{
					"type": "builder_query",
					"spec": {
						"name": "A",
						"signal": "metrics",
						"aggregations": [{"metricName": "requests", "timeAggregation": "rate", "spaceAggregation": "sum"}],
						"functions": [{"name": "anomaly", "args": [{"name": "z_score_threshold", "value": 3}]}]
					}
				}]
			},
			"target": 3,
			"targetUnit": "ms",
			"matchType": "1",
			"op": "1",
			"selectedQueryName": "A"
		},
		"labels": {"severity": "warning"},
		"annotations": {"summary": "requests deviate"}
	}`
	for i := 0; i+1 < len(replace); i += 2 {
		rule = strings.Replace(rule, replace[i], replace[i+1], 1)
	}
	return rule
}

func parseRule(t *testing.T, raw string) (*PostableRule, error) {
	t.Helper()
	rule := &PostableRule{}
	if err := json.Unmarshal([]byte(raw), rule); err != nil {
		return rule, err
	}
	return rule, rule.Validate()
}

func basicThreshold(t *testing.T, rule *PostableRule) BasicRuleThreshold {
	t.Helper()
	require.NotNil(t, rule.RuleCondition.Thresholds)
	spec, ok := rule.RuleCondition.Thresholds.Spec.(BasicRuleThresholds)
	require.True(t, ok)
	require.Len(t, spec, 1)
	return spec[0]
}

func TestAnomalyRule_BelowNegatesTheTargetInEveryForm(t *testing.T) {
	for _, op := range []string{"2", "below", "<"} {
		t.Run(op, func(t *testing.T) {
			rule, err := parseRule(t, anomalyRuleJSON(`"op": "1"`, `"op": "`+op+`"`))
			require.NoError(t, err)
			threshold := basicThreshold(t, rule)
			require.NotNil(t, threshold.TargetValue)
			assert.Equal(t, -3.0, *threshold.TargetValue)
			assert.Equal(t, 3.0, *rule.RuleCondition.Target)
		})
	}
}

func TestAnomalyRule_Defaults(t *testing.T) {
	rule, err := parseRule(t, anomalyRuleJSON())
	require.NoError(t, err)
	assert.Equal(t, AnomalyAlgorithmStandard, rule.RuleCondition.Algorithm)
	assert.Equal(t, SeasonalityHourly, rule.RuleCondition.Seasonality)
	// The score is unitless: a target unit would convert it as if it were the metric.
	assert.Empty(t, basicThreshold(t, rule).TargetUnit)
}

func TestAnomalyRule_Invalid(t *testing.T) {
	testCases := []struct {
		name      string
		json      string
		errSubstr string
	}{
		{name: "UnknownAlgorithm", json: anomalyRuleJSON(`"selectedQueryName": "A"`, `"selectedQueryName": "A", "algorithm": "robust"`), errSubstr: "condition.algorithm"},
		{name: "TargetBelowOne", json: anomalyRuleJSON(`"target": 3`, `"target": 0.5`), errSubstr: "condition.target"},
		{name: "TargetAboveSeven", json: anomalyRuleJSON(`"target": 3`, `"target": 8`), errSubstr: "condition.target"},
		{name: "NoAnomalyFunction", json: anomalyRuleJSON(`"functions": [{"name": "anomaly", "args": [{"name": "z_score_threshold", "value": 3}]}]`, `"functions": []`), errSubstr: "anomaly function"},
		{name: "SelectedQueryWithoutAnomaly", json: anomalyRuleJSON(`"selectedQueryName": "A"`, `"selectedQueryName": "B"`, `}]
			},`, `}, {"type": "builder_query", "spec": {"name": "B", "signal": "metrics", "aggregations": [{"metricName": "errors", "timeAggregation": "rate", "spaceAggregation": "sum"}]}}]
			},`), errSubstr: "selectedQueryName"},
		{name: "ReservedAnnotation", json: anomalyRuleJSON(`"annotations": {"summary": "requests deviate"}`, `"annotations": {"summary": "requests deviate", "anomaly_baseline": "mine"}`), errSubstr: "anomaly_baseline"},
		{name: "SchemaV2Alpha1", json: `{
			"alert": "A", "version": "v5", "schemaVersion": "v2alpha1", "ruleType": "anomaly_rule",
			"condition": {
				"compositeQuery": {"queryType": "builder", "queries": [{"type": "builder_query", "spec": {"name": "A", "signal": "metrics", "aggregations": [{"metricName": "cpu", "spaceAggregation": "p50"}], "stepInterval": "5m", "functions": [{"name": "anomaly", "args": [{"value": 3}]}]}}]},
				"thresholds": {"kind": "basic", "spec": [{"name": "critical", "target": 3, "matchType": "1", "op": "1"}]}
			},
			"evaluation": {"kind": "rolling", "spec": {"evalWindow": "5m", "frequency": "1m"}},
			"notificationSettings": {"renotify": {"enabled": true, "interval": "4h", "alertStates": ["firing"]}}
		}`, errSubstr: "v2alpha1"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := parseRule(t, testCase.json)
			require.Error(t, err)
			assert.True(t, errorContains(err, testCase.errSubstr), "%v does not mention %q", err, testCase.errSubstr)
		})
	}
}

func TestThresholdRule_MayUseTheAnomalyBaselineAnnotation(t *testing.T) {
	raw := strings.Replace(validV1Builder(), `"version": "v5",`, `"version": "v5", "annotations": {"anomaly_baseline": "mine"},`, 1)
	_, err := parseRule(t, raw)
	assert.NoError(t, err)
}
