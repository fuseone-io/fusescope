package dashboardtypes

import (
	"encoding/json"
	"testing"

	qb "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicPanelUsesSavedVariableDefaults(t *testing.T) {
	var d DashboardV2
	require.NoError(t, json.Unmarshal([]byte(`{"spec":{"layouts":[],"variables":[{"kind":"TextVariable","spec":{"name":"region","value":"south","display":{"name":"Region"}}},{"kind":"ListVariable","spec":{"name":"services","display":{"name":"Services"},"defaultValue":["api","worker"],"allowMultiple":true,"plugin":{"kind":"signoz/CustomVariable","spec":{"customValue":"api,worker"}}}}],"panels":{"requests":{"kind":"Panel","spec":{"plugin":{"kind":"signoz/TimeSeriesPanel","spec":{}},"queries":[{"kind":"time_series","spec":{"plugin":{"kind":"signoz/PromQLQuery","spec":{"name":"A","query":"requests_total{region=\"$region\"}"}}}}]}}}}}`), &d))
	req, err := d.GetPanelQuery(1000, 2000, "requests")
	require.NoError(t, err)
	assert.Equal(t, qb.VariableItem{Type: qb.TextBoxVariableType, Value: "south"}, req.Variables["region"])
	assert.Equal(t, qb.VariableItem{Type: qb.CustomVariableType, Value: []string{"api", "worker"}}, req.Variables["services"])
}

func TestPublicPayloadRedactsDecodedVariableQueries(t *testing.T) {
	var d DashboardV2
	require.NoError(t, json.Unmarshal([]byte(`{"spec":{"layouts":[],"variables":[{"kind":"ListVariable","spec":{"name":"hosts","display":{"name":"Hosts"},"plugin":{"kind":"signoz/QueryVariable","spec":{"queryValue":"SELECT secret FROM private_table"}}}}],"panels":{}}}`), &d))
	payload := NewPublicDashboardDataFromDashboardV2(&d, &PublicDashboard{})
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "SELECT secret")
	original, err := json.Marshal(d)
	require.NoError(t, err)
	assert.Contains(t, string(original), "SELECT secret", "redaction must not mutate the stored dashboard")
}
