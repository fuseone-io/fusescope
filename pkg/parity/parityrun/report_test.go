package parityrun

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func published(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names
}

func TestAReportIsPublishedOnlyWithItsSummary(t *testing.T) {
	dir := t.TempDir()
	w, err := FileSink{Dir: dir}.Create("run-1")
	require.NoError(t, err)
	require.NoError(t, w.Write(Header{Seed: 7}))
	require.NoError(t, w.Write(PairRecord{View: "services"}))
	for _, name := range published(t, dir) {
		assert.False(t, strings.HasSuffix(name, ".jsonl"), "nothing is published before the summary: %s", name)
		info, err := os.Stat(filepath.Join(dir, name))
		require.NoError(t, err)
		assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
	}
	require.NoError(t, w.Publish(Summary{Qualifying: true}))
	assert.Equal(t, []string{"run-1.jsonl"}, published(t, dir), "the temporary file was renamed")
	info, err := os.Stat(filepath.Join(dir, "run-1.jsonl"))
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	f, err := os.Open(filepath.Join(dir, "run-1.jsonl"))
	require.NoError(t, err)
	defer f.Close()
	var kinds []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var line map[string]any
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &line))
		kinds = append(kinds, line["kind"].(string))
	}
	assert.Equal(t, []string{"header", "pair", "summary"}, kinds)
	assert.Error(t, w.Write(PairRecord{}), "nothing after the summary")
	assert.Error(t, w.Publish(Summary{}))
}

func TestAnAbandonedReportLeavesNothing(t *testing.T) {
	dir := t.TempDir()
	w, err := FileSink{Dir: dir}.Create("run-2")
	require.NoError(t, err)
	require.NoError(t, w.Write(Header{}))
	require.NoError(t, w.Abort())
	assert.Empty(t, published(t, dir))
}

func TestAReportNeverOverwritesAnother(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "run-3.jsonl"), []byte("earlier"), 0o600))
	w, err := FileSink{Dir: dir}.Create("run-3")
	require.NoError(t, err)
	assert.Error(t, w.Publish(Summary{}))
	got, err := os.ReadFile(filepath.Join(dir, "run-3.jsonl"))
	require.NoError(t, err)
	assert.Equal(t, "earlier", string(got))
}

func TestAnErrorIsReportedByItsTypeAndCodeOnly(t *testing.T) {
	err := errors.Newf(errors.TypeInternal, errors.CodeInternal, "SELECT secret FROM tenant_a WHERE x = 'acme'")
	record := ErrorOf("engine", err)
	raw, _ := json.Marshal(record)
	assert.NotContains(t, string(raw), "SELECT")
	assert.NotContains(t, string(raw), "acme")
	assert.Equal(t, ErrorRecord{Side: "engine", Type: "internal", Code: errors.CodeInternal.String()}, *record)
	assert.Nil(t, ErrorOf("engine", nil))
	plain := ErrorOf("clickhouse", os.ErrNotExist)
	assert.Equal(t, "unknown", plain.Code, "a foreign error keeps no message either")
}
