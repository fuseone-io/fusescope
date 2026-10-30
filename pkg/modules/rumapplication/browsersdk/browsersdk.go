// Package browsersdk serves the @fusescope/browser bundle this backend ships
// with, so script-tag installs need no external CDN. The snapshot is written
// and verified by `make rum-browser-sdk`.
package browsersdk

import (
	"bytes"
	"embed"
	"encoding/json"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/gorilla/mux"
)

const (
	ScriptFile     = "fusescope.min.js"
	SourceMapFile  = ScriptFile + ".map"
	ScriptRoute    = "/rum/v1/sdk/browser/{version}/" + ScriptFile
	SourceMapRoute = "/rum/v1/sdk/browser/{version}/" + SourceMapFile

	snapshotDir = "snapshot"
)

var ErrCodeVersionNotFound = errors.MustNewCode("rum_browser_sdk_version_not_found")

//go:embed snapshot/*
var embedded embed.FS

var pinned = mustLoad()

type manifest struct {
	Version   string `json:"version"`
	Integrity string `json:"integrity"`
}

type snapshot struct {
	manifest
	script    []byte
	sourceMap []byte
}

func Version() string { return pinned.Version }

// Integrity is the script's Subresource Integrity value, e.g. sha384-….
func Integrity() string { return pinned.Integrity }

func ScriptPath(version string) string {
	return "/rum/v1/sdk/browser/" + version + "/" + ScriptFile
}

func Script(rw http.ResponseWriter, req *http.Request) {
	serve(rw, req, ScriptFile, "application/javascript", pinned.script)
}

func SourceMap(rw http.ResponseWriter, req *http.Request) {
	serve(rw, req, SourceMapFile, "application/json", pinned.sourceMap)
}

func serve(rw http.ResponseWriter, req *http.Request, name string, contentType string, content []byte) {
	version := mux.Vars(req)["version"]
	if version != pinned.Version {
		render.Error(rw, errors.NewNotFoundf(ErrCodeVersionNotFound, "this server serves @fusescope/browser %s only, not %q", pinned.Version, version))
		return
	}

	header := rw.Header()
	header.Set("Content-Type", contentType)
	header.Set("Cache-Control", "public, max-age=31536000, immutable")
	header.Set("Access-Control-Allow-Origin", "*")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("ETag", `"`+pinned.Integrity+`"`)
	http.ServeContent(rw, req, name, time.Time{}, bytes.NewReader(content))
}

func mustLoad() snapshot {
	read := func(name string) []byte {
		content, err := embedded.ReadFile(snapshotDir + "/" + name)
		if err != nil {
			panic(err)
		}
		return content
	}

	var loaded snapshot
	if err := json.Unmarshal(read("manifest.json"), &loaded.manifest); err != nil {
		panic(err)
	}
	if loaded.Version == "" || loaded.Integrity == "" {
		panic("browsersdk: manifest.json has no version or integrity")
	}
	loaded.script = read(ScriptFile)
	loaded.sourceMap = read(SourceMapFile)
	return loaded
}
