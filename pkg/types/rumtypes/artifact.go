package rumtypes

import "github.com/fuseone-io/fusescope/pkg/valuer"

// R8MappingPath is the path a release's R8 mapping is stored at; a release
// holds one, and an upload replaces it.
const R8MappingPath = "/mapping.txt"

var (
	ArtifactKindSourceMap = ArtifactKind{valuer.NewString("source-map")}
	ArtifactKindR8Mapping = ArtifactKind{valuer.NewString("r8-mapping")}
)

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
