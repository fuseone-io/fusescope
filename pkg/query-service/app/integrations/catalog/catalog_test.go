package catalog

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"log/slog"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testManifest = `manifest_version: 1
id: builtin-demo
version: 1.0.0
fusescope: ">=0.1.0"
title: Demo
description: Demo integration
author: {name: FuseScope, email: "", homepage: "https://example.com"}
icon: icon.svg
categories: [Database]
signals: [logs]
overview: overview.md
configuration:
  - {title: Prerequisites, instructions: config/prerequisites.md}
assets:
  logs: {pipelines: []}
  dashboards:
    - {id: overview, definition: assets/dashboards/overview.json}
data_collected: data_collected.json
connection_tests:
  logs: {attribute_key: source, attribute_value: demo}
`

func testPackageFiles() map[string]string {
	return map[string]string{
		"manifest.yaml":                   testManifest,
		"icon.svg":                        "<svg/>",
		"overview.md":                     "# Demo",
		"config/prerequisites.md":         "Install it.",
		"assets/dashboards/overview.json": `{"name": "demo", "big": 1000000}`,
		"data_collected.json":             `{"logs": [], "metrics": []}`,
	}
}

func tarball(t *testing.T, files map[string]string, extra ...*tar.Header) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		require.NoError(t, tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(content)), Typeflag: tar.TypeReg}))
		_, err := tw.Write([]byte(content))
		require.NoError(t, err)
	}
	for _, hdr := range extra {
		require.NoError(t, tw.WriteHeader(hdr))
	}
	require.NoError(t, tw.Close())
	require.NoError(t, gz.Close())
	return buf.Bytes()
}

func testCatalog(t *testing.T, archive []byte, edit func(*Entry)) (fstest.MapFS, string) {
	t.Helper()
	entry := Entry{ID: "builtin-demo", Version: "1.0.0", ManifestVersion: 1, FuseScope: ">=0.1.0", Package: "builtin-demo-1.0.0.tar.gz", SHA256: sha256Hex(archive), Size: len(archive)}
	if edit != nil {
		edit(&entry)
	}
	index, err := json.Marshal(Index{CatalogVersion: 1, Integrations: []Entry{entry}})
	require.NoError(t, err)
	return fstest.MapFS{
		IndexFile:                   {Data: index},
		"builtin-demo-1.0.0.tar.gz": {Data: archive},
	}, sha256Hex(index)
}

func TestLoadEmbedded(t *testing.T) {
	catalog, err := LoadEmbedded(slog.Default(), "v0.154.0")
	require.NoError(t, err)

	ids := []string{}
	for _, pkg := range catalog.Packages {
		ids = append(ids, pkg.ID+"@"+pkg.Version)
		assert.True(t, json.Valid(pkg.Document), pkg.ID)
	}
	assert.ElementsMatch(t, []string{
		"builtin-aws_elasticache_redis@1.0.0", "builtin-aws_rds_mysql@1.0.0", "builtin-aws_rds_postgresql@1.0.0", "builtin-clickhouse@1.0.0", "builtin-gcp_cloudsql@1.0.1",
		"builtin-mongo@1.0.0", "builtin-mysql@1.0.1", "builtin-nginx@1.0.0", "builtin-postgres@1.0.0", "builtin-redis@1.0.0",
	}, ids)
	assert.Equal(t, "fuseone-io/fusescope-integrations", catalog.Source.Repository)
}

func TestLoadRendersThePackage(t *testing.T) {
	fsys, sum := testCatalog(t, tarball(t, testPackageFiles()), nil)
	catalog, err := Load(slog.Default(), fsys, sum, "v0.154.0")
	require.NoError(t, err)
	require.Len(t, catalog.Packages, 1)

	assert.JSONEq(t, `{
		"id": "builtin-demo",
		"title": "Demo",
		"description": "Demo integration",
		"author": {"name": "FuseScope", "email": "", "homepage": "https://example.com"},
		"icon": "data:image/svg+xml;base64,PHN2Zy8+",
		"categories": ["Database"],
		"overview": "# Demo",
		"configuration": [{"title": "Prerequisites", "instructions": "Install it."}],
		"assets": {"logs": {"pipelines": []}, "dashboards": [{"id": "overview", "definition": {"name": "demo", "big": 1e6}}], "alerts": null},
		"connection_tests": {"logs": {"attribute_key": "source", "attribute_value": "demo"}},
		"data_collected": {"logs": [], "metrics": []}
	}`, string(catalog.Packages[0].Document))
}

func TestLoadRejects(t *testing.T) {
	withFiles := func(edit func(map[string]string)) []byte {
		files := testPackageFiles()
		edit(files)
		return tarball(t, files)
	}
	valid := tarball(t, testPackageFiles())

	testCases := []struct {
		name    string
		archive []byte
		entry   func(*Entry)
		index   func(string) string
	}{
		{name: "IndexChecksumMismatch", archive: valid, index: func(string) string { return sha256Hex([]byte("other")) }},
		{name: "PackageChecksumMismatch", archive: valid, entry: func(e *Entry) { e.SHA256 = sha256Hex([]byte("other")) }},
		{name: "PackageSizeMismatch", archive: valid, entry: func(e *Entry) { e.Size++ }},
		{name: "PackageNameWithPath", archive: valid, entry: func(e *Entry) { e.Package = "../builtin-demo-1.0.0.tar.gz" }},
		{name: "ManifestIDMismatch", archive: valid, entry: func(e *Entry) { e.ID = "builtin-other" }},
		{name: "ManifestVersionMismatch", archive: valid, entry: func(e *Entry) { e.Version = "1.0.1" }},
		{name: "ReferencedFileMissing", archive: withFiles(func(f map[string]string) { delete(f, "overview.md") })},
		{name: "DashboardNotAnObject", archive: withFiles(func(f map[string]string) { f["assets/dashboards/overview.json"] = `[]` })},
		{name: "UnknownManifestField", archive: withFiles(func(f map[string]string) { f["manifest.yaml"] += "unknown: true\n" })},
		{name: "ManifestMissing", archive: withFiles(func(f map[string]string) { delete(f, "manifest.yaml") })},
		{name: "UnsupportedIcon", archive: withFiles(func(f map[string]string) {
			f["manifest.yaml"] = string(bytes.Replace([]byte(f["manifest.yaml"]), []byte("icon: icon.svg"), []byte("icon: icon.gif"), 1))
			f["icon.gif"] = "GIF"
		})},
		{name: "PathTraversal", archive: withFiles(func(f map[string]string) { f["../escape.md"] = "x" })},
		{name: "Symlink", archive: tarball(t, testPackageFiles(), &tar.Header{Name: "link", Linkname: "/etc/passwd", Typeflag: tar.TypeSymlink})},
		{name: "NotGzip", archive: []byte("not a tarball")},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fsys, sum := testCatalog(t, testCase.archive, testCase.entry)
			if testCase.index != nil {
				sum = testCase.index(sum)
			}
			catalog, err := Load(slog.Default(), fsys, sum, "v0.154.0")
			assert.Error(t, err)
			assert.Nil(t, catalog)
		})
	}
}

func TestLoadSkipsPackagesThisBackendCannotServe(t *testing.T) {
	testCases := []struct {
		name           string
		entry          func(*Entry)
		backendVersion string
		expectedLoaded int
	}{
		{name: "Compatible", backendVersion: "v0.154.0", expectedLoaded: 1},
		{name: "DevelopmentBuild_Loaded", backendVersion: "main-abc1234", expectedLoaded: 1},
		{name: "BackendTooOld_Skipped", entry: func(e *Entry) { e.FuseScope = ">=0.200.0" }, backendVersion: "v0.154.0", expectedLoaded: 0},
		{name: "UnknownManifestVersion_Skipped", entry: func(e *Entry) { e.ManifestVersion = 2 }, backendVersion: "v0.154.0", expectedLoaded: 0},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fsys, sum := testCatalog(t, tarball(t, testPackageFiles()), testCase.entry)
			catalog, err := Load(slog.Default(), fsys, sum, testCase.backendVersion)
			require.NoError(t, err)
			assert.Len(t, catalog.Packages, testCase.expectedLoaded)
		})
	}
}

func TestSatisfies(t *testing.T) {
	testCases := []struct {
		name       string
		version    string
		constraint string
		expected   bool
		expectErr  bool
	}{
		{name: "Empty", version: "v0.154.0", constraint: "", expected: true},
		{name: "GreaterOrEqual_Equal", version: "v0.154.0", constraint: ">=0.154.0", expected: true},
		{name: "GreaterOrEqual_Below", version: "v0.153.9", constraint: ">=0.154.0", expected: false},
		{name: "VersionWithoutPrefix", version: "0.160.1", constraint: ">=0.154.0", expected: true},
		{name: "Range_Inside", version: "v0.160.0", constraint: ">=0.154.0, <1.0.0", expected: true},
		{name: "Range_Above", version: "v1.2.0", constraint: ">=0.154.0 <1.0.0", expected: false},
		{name: "OperatorApart", version: "v0.154.0", constraint: ">= 0.154.0", expected: true},
		{name: "Exact_Mismatch", version: "v0.154.1", constraint: "0.154.0", expected: false},
		{name: "NotEqual", version: "v0.154.1", constraint: "!=0.154.0", expected: true},
		{name: "PreRelease_BelowRelease", version: "v0.154.0-rc.1", constraint: ">=0.154.0", expected: false},
		{name: "DevelopmentBuild", version: "<unset>", constraint: ">=9.0.0", expected: true},
		{name: "InvalidConstraint", version: "v0.154.0", constraint: ">=latest", expectErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ok, err := satisfies(testCase.version, testCase.constraint)
			if testCase.expectErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, ok)
		})
	}
}
