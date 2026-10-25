package rumtypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
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
