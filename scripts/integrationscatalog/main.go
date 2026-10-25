// Command integrationscatalog downloads the integration catalog release pinned
// in pkg/query-service/app/integrations/catalog/catalog.yaml, verifies its
// Sigstore bundle against the release workflow's identity and every package's
// sha256, and writes it into the snapshot directory the backend embeds.
//
//	go run ./scripts/integrationscatalog                  re-fetch the pinned release
//	go run ./scripts/integrationscatalog -version v1.1.0  move the pin to another release
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"golang.org/x/mod/semver"
	"gopkg.in/yaml.v3"
)

const (
	catalogDir    = "pkg/query-service/app/integrations/catalog"
	pinFile       = "catalog.yaml"
	snapshotDir   = "snapshot"
	indexFile     = "index.json"
	bundleFile    = "index.json.sigstore.json"
	oidcIssuer    = "https://token.actions.githubusercontent.com"
	cosignImage   = "ghcr.io/sigstore/cosign/cosign:v3.0.2@sha256:b29487e48205d875c324c79583e2806d9d269c0fa299e0861bbec023d8430c8b"
	maxAssetBytes = 16 << 20
)

var packageNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]*\.tar\.gz$`)

type pin struct {
	Repository  string `yaml:"repository"`
	Version     string `yaml:"version"`
	IndexSHA256 string `yaml:"index_sha256"`
}

type index struct {
	CatalogVersion int `json:"catalog_version"`
	Integrations   []struct {
		ID      string `json:"id"`
		Version string `json:"version"`
		Package string `json:"package"`
		SHA256  string `json:"sha256"`
		Size    int    `json:"size"`
	} `json:"integrations"`
}

func main() {
	version := flag.String("version", "", "catalog release to pin, e.g. v1.1.0; defaults to the current pin")
	cosign := flag.String("cosign", "", "cosign binary to use instead of the pinned container image")
	flag.Parse()

	if err := run(*version, *cosign); err != nil {
		fmt.Fprintln(os.Stderr, "integrationscatalog:", err)
		os.Exit(1)
	}
}

func run(version, cosign string) error {
	pinPath := filepath.Join(catalogDir, pinFile)
	current, err := readPin(pinPath)
	if err != nil {
		return err
	}
	bump := version != ""
	if bump {
		if !semver.IsValid(version) {
			return fmt.Errorf("%q is not a semver tag", version)
		}
		current.Version = version
	}

	work, err := os.MkdirTemp("", "integrationscatalog-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)
	// The cosign image runs as a non-root user.
	if err := os.Chmod(work, 0o755); err != nil {
		return err
	}

	ctx := context.Background()
	for _, name := range []string{indexFile, bundleFile} {
		if err := download(ctx, current, name, work); err != nil {
			return err
		}
	}
	if err := verifySignature(ctx, current, work, cosign); err != nil {
		return err
	}

	rawIndex, err := os.ReadFile(filepath.Join(work, indexFile))
	if err != nil {
		return err
	}
	indexSum := sha256Hex(rawIndex)
	if !bump && indexSum != current.IndexSHA256 {
		return fmt.Errorf("%s of %s has sha256 %s, the pin says %s", indexFile, current.Version, indexSum, current.IndexSHA256)
	}
	current.IndexSHA256 = indexSum

	var idx index
	if err := json.Unmarshal(rawIndex, &idx); err != nil {
		return fmt.Errorf("%s: %w", indexFile, err)
	}
	if idx.CatalogVersion != 1 {
		return fmt.Errorf("%s: unsupported catalog_version %d", indexFile, idx.CatalogVersion)
	}
	files := []string{indexFile, bundleFile}
	for _, entry := range idx.Integrations {
		if !packageNamePattern.MatchString(entry.Package) {
			return fmt.Errorf("%s %s: invalid package file name %q", entry.ID, entry.Version, entry.Package)
		}
		if err := download(ctx, current, entry.Package, work); err != nil {
			return err
		}
		raw, err := os.ReadFile(filepath.Join(work, entry.Package))
		if err != nil {
			return err
		}
		if sum := sha256Hex(raw); sum != entry.SHA256 || len(raw) != entry.Size {
			return fmt.Errorf("%s: sha256 %s and size %d, the signed index says %s and %d", entry.Package, sum, len(raw), entry.SHA256, entry.Size)
		}
		files = append(files, entry.Package)
	}

	if err := writeSnapshot(work, files); err != nil {
		return err
	}
	if err := writePin(pinPath, current); err != nil {
		return err
	}
	fmt.Printf("catalog %s: %d packages verified and written to %s\n", current.Version, len(idx.Integrations), filepath.Join(catalogDir, snapshotDir))
	return nil
}

func readPin(path string) (pin, error) {
	var p pin
	raw, err := os.ReadFile(path)
	if err != nil {
		return p, err
	}
	dec := yaml.NewDecoder(strings.NewReader(string(raw)))
	dec.KnownFields(true)
	if err := dec.Decode(&p); err != nil {
		return p, fmt.Errorf("%s: %w", path, err)
	}
	if p.Repository == "" || !semver.IsValid(p.Version) {
		return p, fmt.Errorf("%s: repository and a semver version are required", path)
	}
	return p, nil
}

func writePin(path string, p pin) error {
	content := fmt.Sprintf("# Written by `make integrations-catalog`; do not edit by hand.\nrepository: %s\nversion: %s\nindex_sha256: %s\n", p.Repository, p.Version, p.IndexSHA256)
	return os.WriteFile(path, []byte(content), 0o644)
}

func download(ctx context.Context, p pin, name, dir string) error {
	url := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", p.Repository, p.Version, name)
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxAssetBytes+1))
	if err != nil {
		return err
	}
	if len(raw) > maxAssetBytes {
		return fmt.Errorf("GET %s: larger than %d bytes", url, maxAssetBytes)
	}
	return os.WriteFile(filepath.Join(dir, name), raw, 0o644)
}

func verifySignature(ctx context.Context, p pin, dir, cosign string) error {
	identity := "^" + regexp.QuoteMeta(fmt.Sprintf("https://github.com/%s/.github/workflows/release.yaml@refs/tags/%s", p.Repository, p.Version)) + "$"
	args := []string{"verify-blob", "--bundle", bundleFile, "--certificate-identity-regexp", identity, "--certificate-oidc-issuer", oidcIssuer, indexFile}

	var cmd *exec.Cmd
	if cosign != "" {
		cmd = exec.CommandContext(ctx, cosign, args...)
		cmd.Dir = dir
	} else {
		cmd = exec.CommandContext(ctx, "docker", append([]string{"run", "--rm", "-v", dir + ":/work:ro", "-w", "/work", cosignImage}, args...)...)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("cosign verify-blob %s: %w", indexFile, err)
	}
	return nil
}

func writeSnapshot(work string, files []string) error {
	dir := filepath.Join(catalogDir, snapshotDir)
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, name := range files {
		raw, err := os.ReadFile(filepath.Join(work, name))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, name), raw, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
