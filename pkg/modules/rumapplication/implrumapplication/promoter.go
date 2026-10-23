package implrumapplication

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/logstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/ctxtypes"
	"github.com/fuseone-io/fusescope/pkg/types/instrumentationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
)

// The index matches what the fields API (POST /api/v2/traces/fields,
// POST /api/v1/logs/fields) creates for a selected string field.
const (
	promotedIndexType        = "bloom_filter(0.01)"
	promotedIndexGranularity = 64
)

var ErrCodePromoteFields = errors.MustNewCode("rum_promote_fields_failed")

var promotedFields = []promotedField{
	{name: rumtypes.AttributeSessionID, resource: false},
	{name: rumtypes.AttributeViewRoute, resource: false},
	{name: rumtypes.AttributePlatform, resource: true},
	{name: rumtypes.AttributeApplicationID, resource: true},
}

var promotedTables = []promotedTable{
	{database: tracestelemetryschema.DBName, local: tracestelemetryschema.SpanIndexV3LocalTableName, distributed: tracestelemetryschema.SpanIndexV3TableName},
	{database: logstelemetryschema.DBName, local: logstelemetryschema.LogsV2LocalTableName, distributed: logstelemetryschema.LogsV2TableName},
}

type promotedField struct {
	name     string
	resource bool
}

type promotedTable struct {
	database    string
	local       string
	distributed string
}

// fieldPromoter adds the same DEFAULT columns and skip index the fields API
// adds, so RUM fields are selected before the first span arrives. A success
// is remembered for the life of the process.
type fieldPromoter struct {
	telemetryStore telemetrystore.TelemetryStore
	settings       factory.ScopedProviderSettings
	mu             sync.Mutex
	done           bool
}

func newFieldPromoter(telemetryStore telemetrystore.TelemetryStore, providerSettings factory.ProviderSettings) *fieldPromoter {
	return &fieldPromoter{
		telemetryStore: telemetryStore,
		settings:       factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"),
	}
}

func (promoter *fieldPromoter) Promote(ctx context.Context) error {
	promoter.mu.Lock()
	defer promoter.mu.Unlock()

	if promoter.done {
		return nil
	}

	ctx = ctxtypes.NewContextWithCommentVals(ctx, map[string]string{
		instrumentationtypes.CodeNamespace:    "rumapplication",
		instrumentationtypes.CodeFunctionName: "Promote",
	})

	for _, statement := range promotionStatements(promoter.telemetryStore.Cluster()) {
		if err := promoter.telemetryStore.ClickhouseDB().Exec(ctx, statement); err != nil {
			return errors.WrapInternalf(err, ErrCodePromoteFields, "failed to promote rum fields")
		}
	}

	promoter.done = true
	promoter.settings.Logger().InfoContext(ctx, "promoted rum fields", slog.Int("fields", len(promotedFields)))
	return nil
}

func promotionStatements(cluster string) []string {
	statements := []string{}
	for _, table := range promotedTables {
		for _, field := range promotedFields {
			statements = append(statements, field.statements(table, cluster)...)
		}
	}
	return statements
}

func (field promotedField) statements(table promotedTable, cluster string) []string {
	mapColumn := "attributes_string"
	if field.resource {
		mapColumn = "resources_string"
	}

	column := promotedColumn(field.name, field.resource)
	name := clickhousesql.StringLiteral(field.name)
	onCluster := " ON CLUSTER " + clickhousesql.Identifier(cluster)

	statements := []string{}
	for _, tableName := range []string{table.local, table.distributed} {
		target := clickhousesql.Identifier(table.database) + "." + clickhousesql.Identifier(tableName)
		statements = append(statements,
			fmt.Sprintf("ALTER TABLE %s%s ADD COLUMN IF NOT EXISTS %s String DEFAULT %s[%s] CODEC(ZSTD(1))", target, onCluster, clickhousesql.Identifier(column), mapColumn, name),
			fmt.Sprintf("ALTER TABLE %s%s ADD COLUMN IF NOT EXISTS %s Bool DEFAULT if(mapContains(%s, %s) != 0, true, false) CODEC(ZSTD(1))", target, onCluster, clickhousesql.Identifier(column+"_exists"), mapColumn, name),
		)
	}

	local := clickhousesql.Identifier(table.database) + "." + clickhousesql.Identifier(table.local)
	statements = append(statements, fmt.Sprintf("ALTER TABLE %s%s ADD INDEX IF NOT EXISTS %s (%s) TYPE %s GRANULARITY %d", local, onCluster, clickhousesql.Identifier(column+"_idx"), clickhousesql.Identifier(column), promotedIndexType, promotedIndexGranularity))
	return statements
}

// promotedColumn names the column the fields API creates for a string field.
func promotedColumn(name string, resource bool) string {
	prefix := "attribute"
	if resource {
		prefix = "resource"
	}
	return prefix + "_string_" + strings.ReplaceAll(name, ".", "$$")
}
