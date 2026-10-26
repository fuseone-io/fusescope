package rumtypes

import (
	"regexp"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// R8MappingPath is the path a release's mapping without a map id is stored
// at; an upload replaces it. A mapping with a map id is stored at its own
// path, so the builds of one release keep their mappings.
const R8MappingPath = "/mapping.txt"

// r8MapIDSourceFile prefixes the source file of the frames of a build whose
// map id R8 writes in place of SourceFile.
const r8MapIDSourceFile = "r8-map-id-"

var (
	ArtifactKindSourceMap = ArtifactKind{valuer.NewString("source-map")}
	ArtifactKindR8Mapping = ArtifactKind{valuer.NewString("r8-mapping")}
)

var r8MapIDPattern = regexp.MustCompile(`^[0-9a-z]{1,64}$`)

// ArtifactKind is what a symbolication artifact holds: a browser source map
// or an Android R8/ProGuard mapping.
type ArtifactKind struct{ valuer.String }

func (ArtifactKind) Enum() []any {
	return []any{ArtifactKindSourceMap, ArtifactKindR8Mapping}
}

// ArtifactKindFor is the kind of artifact a platform's stack traces are
// symbolicated with.
func ArtifactKindFor(platform Platform) ArtifactKind {
	if platform == PlatformAndroid {
		return ArtifactKindR8Mapping
	}
	return ArtifactKindSourceMap
}

func FilterArtifacts(files []*StorableSourceMap, kind ArtifactKind) []*StorableSourceMap {
	kept := []*StorableSourceMap{}
	for _, file := range files {
		if file.Kind == kind {
			kept = append(kept, file)
		}
	}
	return kept
}

// NewR8MappingKey returns the map id and the path a mapping is stored at,
// from the map id an uploader gave and the pg_map_id of the mapping's
// header. A given id must equal the header's; a header id that is not an id
// is ignored.
func NewR8MappingKey(given string, header string) (string, string, error) {
	given, header = strings.ToLower(strings.TrimSpace(given)), strings.ToLower(header)
	if given != "" && !r8MapIDPattern.MatchString(given) {
		return "", "", errors.NewInvalidInputf(ErrCodeSourceMapInvalidInput, "map_id must be 1 to 64 letters and digits, the pg_map_id of the mapping")
	}
	if !r8MapIDPattern.MatchString(header) {
		header = ""
	}
	if given != "" && header != "" && given != header {
		return "", "", errors.NewInvalidInputf(ErrCodeSourceMapInvalidInput, "map_id %s differs from the mapping's pg_map_id %s", given, header)
	}

	mapID := given
	if mapID == "" {
		mapID = header
	}
	if mapID == "" {
		return "", R8MappingPath, nil
	}
	return mapID, "/mapping-" + mapID + ".txt", nil
}

// SelectR8Mapping picks among a release's files the R8 mapping whose map id
// is mapID, else the latest uploaded.
func SelectR8Mapping(files []*StorableSourceMap, mapID string) *StorableSourceMap {
	mapID = strings.ToLower(mapID)
	var latest *StorableSourceMap
	for _, file := range files {
		if file.Kind != ArtifactKindR8Mapping {
			continue
		}
		if mapID != "" && file.DebugID == mapID {
			return file
		}
		if latest == nil || file.CreatedAt.After(latest.CreatedAt) {
			latest = file
		}
	}
	return latest
}
