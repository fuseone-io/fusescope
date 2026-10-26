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

func TestArtifactKindFor(t *testing.T) {
	testCases := []struct {
		name     string
		platform Platform
		expected ArtifactKind
	}{
		{name: "Web_SourceMap", platform: PlatformWeb, expected: ArtifactKindSourceMap},
		{name: "Android_R8Mapping", platform: PlatformAndroid, expected: ArtifactKindR8Mapping},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, ArtifactKindFor(testCase.platform))
		})
	}
}

func TestStorableSourceMapKind(t *testing.T) {
	orgID, applicationID := valuer.GenerateUUID(), valuer.GenerateUUID()
	testCases := []struct {
		name      string
		kind      ArtifactKind
		path      string
		extension string
		generated string
	}{
		{name: "SourceMap_MapExtension", kind: ArtifactKindSourceMap, path: "/assets/main.js.map", extension: ".map", generated: "/assets/main.js"},
		{name: "R8Mapping_TxtExtension", kind: ArtifactKindR8Mapping, path: R8MappingPath, extension: ".txt", generated: ""},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			file := NewStorableSourceMap(orgID, applicationID, testCase.kind, "1.0.0", testCase.path, "", 10, "ci@example.com", time.Now())
			assert.Equal(t, orgID.StringValue()+"/"+applicationID.StringValue()+"/"+file.ID.StringValue()+testCase.extension, file.StorageKey())

			gettable := NewSourceMapFile(file)
			assert.Equal(t, testCase.kind, gettable.Kind)
			assert.Equal(t, testCase.generated, gettable.GeneratedPath)
		})
	}
}

func TestFilterArtifacts(t *testing.T) {
	orgID, applicationID, now := valuer.GenerateUUID(), valuer.GenerateUUID(), time.Now()
	sourceMap := NewStorableSourceMap(orgID, applicationID, ArtifactKindSourceMap, "1.0.0", "/a.js.map", "", 1, "", now)
	mapping := NewStorableSourceMap(orgID, applicationID, ArtifactKindR8Mapping, "1.0.0", R8MappingPath, "", 1, "", now)

	assert.Equal(t, []*StorableSourceMap{mapping}, FilterArtifacts([]*StorableSourceMap{sourceMap, mapping}, ArtifactKindR8Mapping))
	assert.Equal(t, []*StorableSourceMap{sourceMap}, FilterArtifacts([]*StorableSourceMap{sourceMap, mapping}, ArtifactKindSourceMap))
}

func TestNewR8MappingKey(t *testing.T) {
	testCases := []struct {
		name     string
		given    string
		header   string
		mapID    string
		path     string
		rejected bool
	}{
		{name: "NoMapID_ReleasePath", path: "/mapping.txt"},
		{name: "HeaderMapID_KeyedPath", header: "7e4c1a9", mapID: "7e4c1a9", path: "/mapping-7e4c1a9.txt"},
		{name: "GivenMapID_KeyedPath", given: "260EABAB", mapID: "260eabab", path: "/mapping-260eabab.txt"},
		{name: "GivenEqualsHeader_KeyedPath", given: "7e4c1a9", header: "7e4c1a9", mapID: "7e4c1a9", path: "/mapping-7e4c1a9.txt"},
		{name: "GivenDiffersFromHeader_Rejected", given: "260eabab", header: "7e4c1a9", rejected: true},
		{name: "GivenNotAnID_Rejected", given: "../etc", rejected: true},
		{name: "HeaderNotAnID_ReleasePath", header: "a b", path: "/mapping.txt"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			mapID, path, err := NewR8MappingKey(testCase.given, testCase.header)
			if testCase.rejected {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.mapID, mapID)
			assert.Equal(t, testCase.path, path)
		})
	}
}

func TestSelectR8Mapping(t *testing.T) {
	now := time.Now()
	older := &StorableSourceMap{Kind: ArtifactKindR8Mapping, DebugID: "7e4c1a9", TimeAuditable: types.TimeAuditable{CreatedAt: now.Add(-time.Hour)}}
	newer := &StorableSourceMap{Kind: ArtifactKindR8Mapping, DebugID: "260eabab", TimeAuditable: types.TimeAuditable{CreatedAt: now}}
	unkeyed := &StorableSourceMap{Kind: ArtifactKindR8Mapping, TimeAuditable: types.TimeAuditable{CreatedAt: now.Add(-2 * time.Hour)}}
	sourceMap := &StorableSourceMap{Kind: ArtifactKindSourceMap, DebugID: "7e4c1a9", TimeAuditable: types.TimeAuditable{CreatedAt: now.Add(time.Hour)}}
	files := []*StorableSourceMap{older, unkeyed, sourceMap, newer}

	testCases := []struct {
		name  string
		files []*StorableSourceMap
		mapID string
		want  *StorableSourceMap
	}{
		{name: "MatchingMapID_Matched", files: files, mapID: "7e4c1a9", want: older},
		{name: "MatchingMapIDOtherCase_Matched", files: files, mapID: "7E4C1A9", want: older},
		{name: "UnknownMapID_Latest", files: files, mapID: "ffffffff", want: newer},
		{name: "NoMapID_Latest", files: files, want: newer},
		{name: "NoMappings_Nil", files: []*StorableSourceMap{sourceMap}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Same(t, testCase.want, SelectR8Mapping(testCase.files, testCase.mapID))
		})
	}
}
