package rumtypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewSourceMapPath(t *testing.T) {
	testCases := []struct {
		name     string
		raw      string
		expected string
		fails    bool
	}{
		{name: "Absolute", raw: "/assets/index-abc123.js.map", expected: "/assets/index-abc123.js.map"},
		{name: "Relative_LeadingSlashAdded", raw: "assets/main.4f9c2a.js.map", expected: "/assets/main.4f9c2a.js.map"},
		{name: "FullURL_PathKept", raw: "https://shop.example.com/assets/main.js.map?v=2#x", expected: "/assets/main.js.map"},
		{name: "PercentEncoded_Decoded", raw: "/assets/caf%C3%A9.js.map", expected: "/assets/café.js.map"},
		{name: "Backslashes", raw: `assets\main.js.map`, expected: "/assets/main.js.map"},
		{name: "DotSegments_Cleaned", raw: "/assets/./x/../main.js.map", expected: "/assets/main.js.map"},
		{name: "Spaces_Trimmed", raw: "  /main.js.map ", expected: "/main.js.map"},
		{name: "Empty_Fails", raw: " ", fails: true},
		{name: "OnlySlash_Fails", raw: "/", fails: true},
		{name: "BadEscape_Fails", raw: "/assets/%zz.js.map", fails: true},
		{name: "TooLong_Fails", raw: "/" + string(make([]byte, maxSourceMapPathLength)), fails: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			path, err := NewSourceMapPath(testCase.raw)
			if testCase.fails {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, path)
		})
	}
}

func TestSourceMapIndexMatch(t *testing.T) {
	files := []*StorableSourceMap{
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/assets/main.4f9c2a.js.map"},
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/vendor.js.map"},
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/static/js/vendor.js.map"},
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/assets/exact-bundle.js"},
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/chunks/a.js.map", DebugID: "85314830-023f-4cf1-a267-535f4e37bb17"},
		{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Path: "/caf%C3%A9.js.map"},
	}
	index := NewSourceMapIndex(files)

	testCases := []struct {
		name     string
		file     string
		debugID  string
		expected *StorableSourceMap
	}{
		{name: "BasenameConvention", file: "https://shop.example.com/assets/main.4f9c2a.js", expected: files[0]},
		{name: "BasenameConvention_QueryIgnored", file: "https://shop.example.com/assets/main.4f9c2a.js?v=1", expected: files[0]},
		{name: "ExactUploadedPath", file: "https://shop.example.com/assets/exact-bundle.js", expected: files[3]},
		{name: "ServedUnderPrefix_SuffixMatch", file: "https://cdn.example.com/shop/v2/assets/main.4f9c2a.js", expected: files[0]},
		{name: "SuffixMatch_LongestWins", file: "https://shop.example.com/static/js/vendor.js", expected: files[2]},
		{name: "SuffixMatch_SegmentBoundary", file: "https://shop.example.com/assets/xvendor.js", expected: nil},
		{name: "DebugID_WinsOverPath", file: "https://shop.example.com/vendor.js", debugID: "85314830-023F-4CF1-A267-535F4E37BB17", expected: files[4]},
		{name: "UnknownDebugID_FallsBackToPath", file: "https://shop.example.com/vendor.js", debugID: "00000000-0000-4000-8000-000000000000", expected: files[1]},
		{name: "PercentEncodedFrame", file: "https://shop.example.com/caf%C3%A9.js", expected: files[5]},
		{name: "RelativeFrame", file: "/assets/main.4f9c2a.js", expected: files[0]},
		{name: "Anonymous_NoMatch", file: "<anonymous>", expected: nil},
		{name: "Empty_NoMatch", file: "", expected: nil},
		{name: "OtherFile_NoMatch", file: "https://shop.example.com/assets/main.71be04.js", expected: nil},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, index.Match(testCase.file, testCase.debugID))
		})
	}
}

func TestSourceMapUploadPlanAdd(t *testing.T) {
	limits := SourceMapLimits{MaxFileSize: 100, MaxFilesPerRelease: 3, Quota: 500}
	existing := []*StorableSourceMap{
		{Release: "1.8.0", Path: "/a.js.map", Size: 100},
		{Release: "1.8.0", Path: "/b.js.map", Size: 50},
		{Release: "1.7.4", Path: "/a.js.map", Size: 300},
	}

	testCases := []struct {
		name     string
		files    map[string]int64
		order    []string
		expected string
	}{
		{name: "NewFile_Fits", order: []string{"/c.js.map"}, files: map[string]int64{"/c.js.map": 50}},
		{name: "Replace_FreesOldSize", order: []string{"/a.js.map"}, files: map[string]int64{"/a.js.map": 100}},
		{name: "Replace_DoesNotCountAsNewFile", order: []string{"/a.js.map", "/b.js.map", "/c.js.map"}, files: map[string]int64{"/a.js.map": 10, "/b.js.map": 10, "/c.js.map": 10}},
		{name: "FileTooLarge_Rejected", order: []string{"/c.js.map"}, files: map[string]int64{"/c.js.map": 101}, expected: "rejected"},
		{name: "EmptyFile_Rejected", order: []string{"/c.js.map"}, files: map[string]int64{"/c.js.map": 0}, expected: "rejected"},
		{name: "QuotaExceeded_PayloadTooLarge", order: []string{"/c.js.map"}, files: map[string]int64{"/c.js.map": 51}, expected: "too-large"},
		{name: "TooManyFiles_InvalidInput", order: []string{"/c.js.map", "/d.js.map"}, files: map[string]int64{"/c.js.map": 1, "/d.js.map": 1}, expected: "invalid"},
		{name: "DuplicatePath_Rejected", order: []string{"/c.js.map", "/c.js.map"}, files: map[string]int64{"/c.js.map": 1}, expected: "rejected"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			plan := NewSourceMapUploadPlan(limits, existing, "1.8.0")
			var err error
			rejection := ""
			for _, path := range testCase.order {
				if rejection, err = plan.Add(path, testCase.files[path]); err != nil || rejection != "" {
					break
				}
			}
			switch testCase.expected {
			case "rejected":
				assert.NoError(t, err)
				assert.NotEmpty(t, rejection)
			case "too-large":
				assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge), err)
			case "invalid":
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err)
			default:
				assert.NoError(t, err)
				assert.Empty(t, rejection)
			}
		})
	}
}

func TestSourceMapUploadPlanReplaced(t *testing.T) {
	existing := []*StorableSourceMap{{Release: "1.8.0", Path: "/a.js.map", Size: 10}, {Release: "1.7.4", Path: "/b.js.map", Size: 10}}
	plan := NewSourceMapUploadPlan(SourceMapLimits{MaxFileSize: 100, MaxFilesPerRelease: 10, Quota: 1000}, existing, "1.8.0")
	for _, path := range []string{"/a.js.map", "/b.js.map"} {
		rejection, err := plan.Add(path, 5)
		require.NoError(t, err)
		require.Empty(t, rejection)
	}

	assert.Equal(t, []*StorableSourceMap{existing[0]}, plan.Replaced())
}

func TestNewSourceMapReleases(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	day := 24 * time.Hour
	at := func(ago time.Duration) time.Time { return now.Add(-ago) }
	ptr := func(value time.Time) *time.Time { return &value }
	used := func(ago time.Duration) *time.Time { return ptr(now.Add(-ago)) }
	file := func(release string, size int64, uploaded time.Time, by string, lastUsed *time.Time) *StorableSourceMap {
		return &StorableSourceMap{TimeAuditable: types.TimeAuditable{CreatedAt: uploaded}, Release: release, Size: size, CreatedBy: by, LastUsedAt: lastUsed}
	}
	files := []*StorableSourceMap{
		file("1.8.0", 10, at(1*day), "ci@example.com", used(time.Hour)),
		file("1.8.0", 20, at(1*day-time.Minute), "ci@example.com", nil),
		file("1.7.4", 30, at(10*day), "jane@example.com", used(5*day)),
		file("1.7.3", 40, at(20*day), "ci@example.com", nil),
		file("1.7.1", 50, at(120*day), "ci@example.com", used(87*day)),
		file("1.6.0", 60, at(200*day), "ci@example.com", used(100*day)),
	}

	testCases := []struct {
		name     string
		settings SourceMapSettings
		expires  map[string]*time.Time
		expired  []string
	}{
		{
			name:     "NinetyDays_KeepNewest",
			settings: SourceMapSettings{Retention: SourceMapRetention90Days, KeepNewestReleases: true},
			expires:  map[string]*time.Time{"1.8.0": nil, "1.7.4": nil, "1.7.3": nil, "1.7.1": ptr(at(87 * day).Add(90 * day)), "1.6.0": ptr(at(100 * day).Add(90 * day))},
			expired:  []string{"1.6.0"},
		},
		{
			name:     "ThirtyDays_NoKeep",
			settings: SourceMapSettings{Retention: SourceMapRetention30Days},
			expires:  map[string]*time.Time{"1.8.0": ptr(at(time.Hour).Add(30 * day)), "1.7.4": ptr(at(5 * day).Add(30 * day)), "1.7.3": ptr(at(20 * day).Add(30 * day)), "1.7.1": ptr(at(87 * day).Add(30 * day)), "1.6.0": ptr(at(100 * day).Add(30 * day))},
			expired:  []string{"1.7.1", "1.6.0"},
		},
		{
			name:     "Never",
			settings: SourceMapSettings{Retention: SourceMapRetentionNever, KeepNewestReleases: true},
			expires:  map[string]*time.Time{"1.8.0": nil, "1.7.4": nil, "1.7.3": nil, "1.7.1": nil, "1.6.0": nil},
		},
		{
			name:     "OneYear",
			settings: SourceMapSettings{Retention: SourceMapRetentionOneYear, KeepNewestReleases: true},
			expires:  map[string]*time.Time{"1.8.0": nil, "1.7.4": nil, "1.7.3": nil, "1.7.1": ptr(at(87 * day).Add(365 * day)), "1.6.0": ptr(at(100 * day).Add(365 * day))},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			releases := NewSourceMapReleases(files, testCase.settings)
			require.Len(t, releases, 5)

			names := []string{}
			for _, release := range releases {
				names = append(names, release.Release)
				assert.Equal(t, testCase.expires[release.Release], release.ExpiresAt, release.Release)
			}
			assert.Equal(t, []string{"1.8.0", "1.7.4", "1.7.3", "1.7.1", "1.6.0"}, names)
			assert.Equal(t, testCase.expired, ExpiredSourceMapReleases(releases, now))
		})
	}

	newest := NewSourceMapReleases(files, NewDefaultSourceMapSettings())[0]
	assert.Equal(t, int64(2), newest.Files)
	assert.Equal(t, int64(30), newest.SizeBytes)
	assert.Equal(t, at(1*day-time.Minute), newest.UploadedAt)
	assert.Equal(t, "ci@example.com", newest.UploadedBy)
	assert.Equal(t, used(time.Hour), newest.LastUsedAt)
}

func TestSourceMapSettingsUnmarshal(t *testing.T) {
	testCases := []struct {
		name     string
		raw      string
		expected SourceMapSettings
		fails    bool
	}{
		{name: "Empty_Defaults", raw: `{}`, expected: SourceMapSettings{Retention: SourceMapRetention90Days, KeepNewestReleases: true}},
		{name: "Never_KeepOff", raw: `{"retention":"never","keepNewestReleases":false}`, expected: SourceMapSettings{Retention: SourceMapRetentionNever}},
		{name: "OneYear", raw: `{"retention":"1y"}`, expected: SourceMapSettings{Retention: SourceMapRetentionOneYear, KeepNewestReleases: true}},
		{name: "Unknown_Fails", raw: `{"retention":"7d"}`, fails: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			settings := SourceMapSettings{}
			err := settings.UnmarshalJSON([]byte(testCase.raw))
			if testCase.fails {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, settings)
		})
	}
}
