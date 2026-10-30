// Command rumbrowsersdk downloads a @fusescope/browser release from the npm
// registry, verifies the tarball against the registry's dist.integrity and the
// bundle against the package's published .sri, and writes the snapshot the
// backend embeds and serves under /rum/v1/sdk/browser/.
//
//	go run ./scripts/rumbrowsersdk                        re-fetch the pinned version
//	go run ./scripts/rumbrowsersdk -version 0.3.0         move the pin to another version
package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)

const (
	packageName  = "@fusescope/browser"
	registry     = "https://registry.npmjs.org/"
	snapshotDir  = "pkg/modules/rumapplication/browsersdk/snapshot"
	manifestFile = "manifest.json"
	maxBytes     = 32 << 20
)

// snapshotFiles maps each file kept from the tarball to its name in the snapshot.
var snapshotFiles = map[string]string{
	"package/dist/fusescope.min.js":     "fusescope.min.js",
	"package/dist/fusescope.min.js.map": "fusescope.min.js.map",
	"package/LICENSE":                   "LICENSE",
	"package/NOTICE":                    "NOTICE",
}

type manifest struct {
	Package          string `json:"package"`
	Version          string `json:"version"`
	Integrity        string `json:"integrity"`
	Tarball          string `json:"tarball"`
	TarballIntegrity string `json:"tarballIntegrity"`
}

type registryVersion struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Dist    struct {
		Tarball   string `json:"tarball"`
		Integrity string `json:"integrity"`
	} `json:"dist"`
}

func main() {
	version := flag.String("version", "", "@fusescope/browser version to pin, e.g. 0.3.0; defaults to the current pin")
	flag.Parse()

	if err := run(*version); err != nil {
		fmt.Fprintln(os.Stderr, "rumbrowsersdk:", err)
		os.Exit(1)
	}
}

func run(version string) error {
	current, err := readManifest()
	if err != nil {
		return err
	}
	bump := version != "" && version != current.Version
	if version == "" {
		version = current.Version
	}
	if !semver.IsValid("v" + version) {
		return fmt.Errorf("%q is not a semver version", version)
	}

	ctx := context.Background()
	meta, err := fetchMetadata(ctx, version)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(meta.Dist.Tarball, registry) {
		return fmt.Errorf("tarball %s is not on %s", meta.Dist.Tarball, registry)
	}
	if !bump && meta.Dist.Integrity != current.TarballIntegrity {
		return fmt.Errorf("%s@%s has dist.integrity %s, the pin says %s", packageName, version, meta.Dist.Integrity, current.TarballIntegrity)
	}

	tarball, err := get(ctx, meta.Dist.Tarball)
	if err != nil {
		return err
	}
	if err := verifyIntegrity(tarball, meta.Dist.Integrity); err != nil {
		return fmt.Errorf("tarball: %w", err)
	}

	files, err := extract(tarball)
	if err != nil {
		return err
	}
	sri := strings.TrimSpace(string(files["package/dist/fusescope.min.js.sri"]))
	if err := verifyIntegrity(files["package/dist/fusescope.min.js"], sri); err != nil {
		return fmt.Errorf("fusescope.min.js: %w", err)
	}
	if !bump && sri != current.Integrity {
		return fmt.Errorf("fusescope.min.js has integrity %s, the pin says %s", sri, current.Integrity)
	}

	next := manifest{Package: packageName, Version: version, Integrity: sri, Tarball: meta.Dist.Tarball, TarballIntegrity: meta.Dist.Integrity}
	if err := writeSnapshot(files, next); err != nil {
		return err
	}
	fmt.Printf("%s@%s: tarball and bundle verified and written to %s\n", packageName, version, snapshotDir)
	return nil
}

func readManifest() (manifest, error) {
	var m manifest
	raw, err := os.ReadFile(filepath.Join(snapshotDir, manifestFile))
	if errors.Is(err, os.ErrNotExist) {
		return m, nil
	}
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("%s: %w", manifestFile, err)
	}
	return m, nil
}

func fetchMetadata(ctx context.Context, version string) (*registryVersion, error) {
	raw, err := get(ctx, registry+url.PathEscape(packageName)+"/"+url.PathEscape(version))
	if err != nil {
		return nil, err
	}
	var meta registryVersion
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, fmt.Errorf("registry metadata: %w", err)
	}
	if meta.Name != packageName || meta.Version != version {
		return nil, fmt.Errorf("registry returned %s@%s for %s@%s", meta.Name, meta.Version, packageName, version)
	}
	return &meta, nil
}

func get(ctx context.Context, target string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", target, resp.Status)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxBytes {
		return nil, fmt.Errorf("GET %s: larger than %d bytes", target, maxBytes)
	}
	return raw, nil
}

// verifyIntegrity checks content against a Subresource Integrity value, the
// format of both npm's dist.integrity and the package's .sri file.
func verifyIntegrity(content []byte, integrity string) error {
	algorithm, expected, ok := strings.Cut(integrity, "-")
	if !ok {
		return fmt.Errorf("malformed integrity %q", integrity)
	}
	var digest hash.Hash
	switch algorithm {
	case "sha384":
		digest = sha512.New384()
	case "sha512":
		digest = sha512.New()
	default:
		return fmt.Errorf("unsupported integrity algorithm %q", algorithm)
	}
	digest.Write(content)
	if actual := base64.StdEncoding.EncodeToString(digest.Sum(nil)); actual != expected {
		return fmt.Errorf("%s is %s, expected %s", algorithm, actual, expected)
	}
	return nil
}

func extract(tarball []byte) (map[string][]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(tarball))
	if err != nil {
		return nil, err
	}
	defer gz.Close()

	wanted := map[string]bool{"package/dist/fusescope.min.js.sri": true}
	for name := range snapshotFiles {
		wanted[name] = true
	}
	files := map[string][]byte{}
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
		if header.Typeflag != tar.TypeReg || !wanted[header.Name] {
			continue
		}
		content, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
		if err != nil {
			return nil, err
		}
		if len(content) > maxBytes {
			return nil, fmt.Errorf("%s: larger than %d bytes", header.Name, maxBytes)
		}
		files[header.Name] = content
	}
	for name := range wanted {
		if _, ok := files[name]; !ok {
			return nil, fmt.Errorf("tarball has no %s", name)
		}
	}
	return files, nil
}

func writeSnapshot(files map[string][]byte, m manifest) error {
	if err := os.RemoveAll(snapshotDir); err != nil {
		return err
	}
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		return err
	}
	for from, to := range snapshotFiles {
		if err := os.WriteFile(filepath.Join(snapshotDir, to), files[from], 0o644); err != nil {
			return err
		}
	}
	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(snapshotDir, manifestFile), append(raw, '\n'), 0o644)
}
