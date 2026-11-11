package parityrun

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const orgA = "0190f3a1-7b2c-7d4e-9f00-112233445566"
const orgB = "0190f3a1-7b2c-7d4e-9f00-112233445577"

func tenantsYAML(body string) string {
	return "version: 1\ntenants:\n" + body
}

const tenantA = `  - org: ` + orgA + `
    dual_write_epoch: 2026-11-01T00:00:00Z
    retention: {clickhouse: 720h, engine: 168h}
    collector_instances: [c-0, c-1]
`

func TestATenantsFileNamesEachTenantsEpochRetentionAndCollectors(t *testing.T) {
	cfg, err := ParseTenants(strings.NewReader(tenantsYAML(tenantA)))
	require.NoError(t, err)
	require.Len(t, cfg.Tenants, 1)
	tenant := cfg.Tenants[0]
	assert.Equal(t, orgA, tenant.Org.StringValue())
	assert.Equal(t, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), tenant.DualWriteEpoch)
	assert.Equal(t, 720*time.Hour, tenant.Retention.ClickHouse)
	assert.Equal(t, 168*time.Hour, tenant.Retention.Engine)
	assert.True(t, cfg.Serves("c-1", orgA))
	assert.False(t, cfg.Serves("c-9", orgA))
	assert.False(t, cfg.Serves("c-0", orgB))
}

func TestATenantsFileIsRefusedWhole(t *testing.T) {
	tenantB := strings.ReplaceAll(tenantA, orgA, orgB)
	cases := map[string]string{
		"no version":           "tenants:\n" + tenantA,
		"another version":      "version: 2\ntenants:\n" + tenantA,
		"no tenant":            "version: 1\ntenants: []\n",
		"an unknown field":     tenantsYAML(tenantA + "    tier: gold\n"),
		"a repeated org":       tenantsYAML(tenantA + tenantA),
		"not an org":           tenantsYAML(strings.ReplaceAll(tenantA, orgA, "acme")),
		"no epoch":             tenantsYAML(strings.ReplaceAll(tenantA, "    dual_write_epoch: 2026-11-01T00:00:00Z\n", "")),
		"no retention":         tenantsYAML(strings.ReplaceAll(tenantA, "engine: 168h", "engine: 0s")),
		"no collector":         tenantsYAML(strings.ReplaceAll(tenantA, "[c-0, c-1]", "[]")),
		"a repeated collector": tenantsYAML(strings.ReplaceAll(tenantA, "[c-0, c-1]", "[c-0, c-0]")),
		"one bad of two":       tenantsYAML(tenantA + strings.ReplaceAll(tenantB, "720h", "-1h")),
	}
	for name, body := range cases {
		_, err := ParseTenants(strings.NewReader(body))
		assert.Error(t, err, name)
	}
}
