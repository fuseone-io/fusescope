package tracesstatementbuilder

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/require"
)

// The DataFusion statement of every builder case, or why the dialect refuses
// it. fusescope-engine plans each statement against a tenant session from a
// copy of this file (scripts/backend-sql-fixture.sh there).
const dataFusionGoldenPath = "testdata/datafusion_statements.json"

// dataFusionGoldenVersion is the layout of the file; the engine refuses another.
const dataFusionGoldenVersion = 1

var updateDataFusion = flag.Bool("update-datafusion", false, "rewrite "+dataFusionGoldenPath)

type dataFusionGoldenCase struct {
	Name  string `json:"name"`
	SQL   string `json:"sql,omitempty"`
	Error string `json:"error,omitempty"`
}

type dataFusionGolden struct {
	FormatVersion int                    `json:"format_version"`
	Cases         []dataFusionGoldenCase `json:"cases"`
}

var (
	goldenOnce   sync.Once
	goldenCases  map[string]dataFusionGoldenCase
	goldenMu     sync.Mutex
	goldenSeen   = map[string]dataFusionGoldenCase{}
	goldenLoadEr error
)

func loadDataFusionGolden() {
	goldenCases = map[string]dataFusionGoldenCase{}
	data, err := os.ReadFile(dataFusionGoldenPath)
	if err != nil {
		goldenLoadEr = err
		return
	}
	var golden dataFusionGolden
	if goldenLoadEr = json.Unmarshal(data, &golden); goldenLoadEr != nil {
		return
	}
	for _, c := range golden.Cases {
		goldenCases[c.Name] = c
	}
}

// checkDataFusion builds the case for fusescope-engine and compares it with
// the golden file, or records it under -update-datafusion.
func checkDataFusion(
	t *testing.T,
	metadataStore telemetrytypes.MetadataStore,
	fl flagger.Flagger,
	startMs, endMs uint64,
	requestType qbtypes.RequestType,
	query qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation],
	vars map[string]qbtypes.VariableItem,
) {
	t.Helper()
	builder := NewEngineTraceQueryStatementBuilder(instrumentationtest.New().ToProviderSettings(), metadataStore, fl)
	got := dataFusionGoldenCase{Name: t.Name()}
	stmt, err := builder.Build(context.Background(), valuer.UUID{}, startMs, endMs, requestType, query, vars)
	if err != nil {
		got.Error = err.Error()
	} else {
		require.Empty(t, stmt.Args, "the engine takes no parameters")
		got.SQL = stmt.Query
	}
	if *updateDataFusion {
		goldenMu.Lock()
		goldenSeen[got.Name] = got
		goldenMu.Unlock()
		return
	}
	goldenOnce.Do(loadDataFusionGolden)
	require.NoError(t, goldenLoadEr, "run go test with -update-datafusion")
	want, ok := goldenCases[got.Name]
	require.True(t, ok, "%s has no DataFusion expectation; run go test with -update-datafusion", got.Name)
	require.Equal(t, want, got)
}

func TestMain(m *testing.M) {
	flag.Parse()
	code := m.Run()
	if *updateDataFusion && code == 0 {
		if err := writeDataFusionGolden(); err != nil {
			panic(err)
		}
	}
	os.Exit(code)
}

func writeDataFusionGolden() error {
	golden := dataFusionGolden{FormatVersion: dataFusionGoldenVersion}
	for _, c := range goldenSeen {
		golden.Cases = append(golden.Cases, c)
	}
	sort.Slice(golden.Cases, func(i, j int) bool { return golden.Cases[i].Name < golden.Cases[j].Name })
	data, err := json.MarshalIndent(golden, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dataFusionGoldenPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dataFusionGoldenPath, append(data, '\n'), 0o644)
}
