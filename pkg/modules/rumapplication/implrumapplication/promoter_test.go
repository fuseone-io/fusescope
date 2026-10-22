package implrumapplication

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPromotionStatements(t *testing.T) {
	statements := promotionStatements("cluster")
	require.Len(t, statements, len(promotedFields)*2*5)

	testCases := []struct {
		name      string
		statement string
	}{
		{
			name:      "TracesSessionColumn_Local",
			statement: "ALTER TABLE `signoz_traces`.`signoz_index_v3` ON CLUSTER `cluster` ADD COLUMN IF NOT EXISTS `attribute_string_session$$id` String DEFAULT attributes_string['session.id'] CODEC(ZSTD(1))",
		},
		{
			name:      "TracesSessionColumn_Distributed",
			statement: "ALTER TABLE `signoz_traces`.`distributed_signoz_index_v3` ON CLUSTER `cluster` ADD COLUMN IF NOT EXISTS `attribute_string_session$$id` String DEFAULT attributes_string['session.id'] CODEC(ZSTD(1))",
		},
		{
			name:      "TracesSessionExists_Local",
			statement: "ALTER TABLE `signoz_traces`.`signoz_index_v3` ON CLUSTER `cluster` ADD COLUMN IF NOT EXISTS `attribute_string_session$$id_exists` Bool DEFAULT if(mapContains(attributes_string, 'session.id') != 0, true, false) CODEC(ZSTD(1))",
		},
		{
			name:      "TracesSessionIndex_LocalOnly",
			statement: "ALTER TABLE `signoz_traces`.`signoz_index_v3` ON CLUSTER `cluster` ADD INDEX IF NOT EXISTS `attribute_string_session$$id_idx` (`attribute_string_session$$id`) TYPE bloom_filter(0.01) GRANULARITY 64",
		},
		{
			name:      "LogsPlatformResourceColumn",
			statement: "ALTER TABLE `signoz_logs`.`distributed_logs_v2` ON CLUSTER `cluster` ADD COLUMN IF NOT EXISTS `resource_string_fusescope$$rum$$platform` String DEFAULT resources_string['fusescope.rum.platform'] CODEC(ZSTD(1))",
		},
		{
			name:      "LogsApplicationIndex",
			statement: "ALTER TABLE `signoz_logs`.`logs_v2` ON CLUSTER `cluster` ADD INDEX IF NOT EXISTS `resource_string_fusescope$$rum$$application$$id_idx` (`resource_string_fusescope$$rum$$application$$id`) TYPE bloom_filter(0.01) GRANULARITY 64",
		},
		{
			name:      "TracesViewRouteColumn",
			statement: "ALTER TABLE `signoz_traces`.`signoz_index_v3` ON CLUSTER `cluster` ADD COLUMN IF NOT EXISTS `attribute_string_fusescope$$rum$$view$$route` String DEFAULT attributes_string['fusescope.rum.view.route'] CODEC(ZSTD(1))",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Contains(t, statements, testCase.statement)
		})
	}

}

func TestFieldPromoterRunsOnce(t *testing.T) {
	telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
	for _, statement := range promotionStatements(telemetryStore.Cluster()) {
		telemetryStore.Mock().ExpectExec(statement).WillReturnError(nil)
	}

	promoter := newFieldPromoter(telemetryStore, factorytest.NewSettings())
	require.NoError(t, promoter.Promote(context.Background()))
	require.NoError(t, promoter.Promote(context.Background()))

	assert.NoError(t, telemetryStore.Mock().ExpectationsWereMet())
}
