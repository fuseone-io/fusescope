// Package catalog reads the integration catalog released by
// fuseone-io/fusescope-integrations: an index.json signed with Sigstore and one
// tarball per package version. The backend embeds a verified snapshot of one
// release; see the integrations-catalog make target.
package catalog

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log/slog"
	"path"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"gopkg.in/yaml.v3"
)

const (
	// IndexVersion is the index.json format this backend reads.
	IndexVersion = 1
	IndexFile    = "index.json"
)

//go:embed catalog.yaml snapshot/*
var embedded embed.FS

// Index is a catalog release's index.json. Its signature covers every package
// through the checksums it lists.
type Index struct {
	CatalogVersion int     `json:"catalog_version"`
	Source         Source  `json:"source"`
	Integrations   []Entry `json:"integrations"`
}

type Source struct {
	Repository string `json:"repository"`
	Ref        string `json:"ref"`
	Commit     string `json:"commit"`
}

type Entry struct {
	ID              string   `json:"id"`
	Version         string   `json:"version"`
	ManifestVersion int      `json:"manifest_version"`
	FuseScope       string   `json:"fusescope"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	Categories      []string `json:"categories"`
	Signals         []string `json:"signals"`
	Package         string   `json:"package"`
	SHA256          string   `json:"sha256"`
	Size            int      `json:"size"`
}

// Package is one package version, rendered as the integrations API serves it.
type Package struct {
	ID      string
	Version string
	// Document is the integration as JSON, with every file the manifest
	// references inlined.
	Document []byte
}

type Catalog struct {
	Source   Source
	Packages []Package
}

// Pin is catalog.yaml: the release the snapshot holds and its index checksum.
type Pin struct {
	Repository  string `yaml:"repository"`
	Version     string `yaml:"version"`
	IndexSHA256 string `yaml:"index_sha256"`
}

// LoadEmbedded loads the snapshot built into the binary.
func LoadEmbedded(logger *slog.Logger, backendVersion string) (*Catalog, error) {
	rawPin, err := embedded.ReadFile("catalog.yaml")
	if err != nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog pin: %s", err.Error())
	}
	var pin Pin
	if err := yaml.Unmarshal(rawPin, &pin); err != nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog pin: %s", err.Error())
	}
	snapshot, err := fs.Sub(embedded, "snapshot")
	if err != nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog snapshot: %s", err.Error())
	}
	return Load(logger, snapshot, pin.IndexSHA256, backendVersion)
}

// Load reads a catalog laid out as a release: index.json next to the package
// tarballs. index.json must hash to indexSHA256 and each tarball to the
// checksum the index lists. Packages this backend cannot serve, by manifest
// format or by their fusescope constraint, are skipped and logged.
func Load(logger *slog.Logger, fsys fs.FS, indexSHA256 string, backendVersion string) (*Catalog, error) {
	rawIndex, err := fs.ReadFile(fsys, IndexFile)
	if err != nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog index: %s", err.Error())
	}
	if sum := sha256Hex(rawIndex); sum != indexSHA256 {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog index has sha256 %s, expected %s", sum, indexSHA256)
	}

	var index Index
	dec := json.NewDecoder(bytes.NewReader(rawIndex))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&index); err != nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog index: %s", err.Error())
	}
	if index.CatalogVersion != IndexVersion {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog index has catalog_version %d, this backend reads %d", index.CatalogVersion, IndexVersion)
	}

	catalog := &Catalog{Source: index.Source}
	seen := map[string]struct{}{}
	for _, entry := range index.Integrations {
		key := entry.ID + "@" + entry.Version
		if _, ok := seen[key]; ok {
			return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration catalog lists %s twice", key)
		}
		seen[key] = struct{}{}

		if reason := unsupported(entry, backendVersion); reason != "" {
			logger.Warn("skipping integration package", slog.String("id", entry.ID), slog.String("version", entry.Version), slog.String("reason", reason))
			continue
		}

		pkg, err := loadPackage(fsys, entry)
		if err != nil {
			return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration package %s: %s", key, err.Error())
		}
		catalog.Packages = append(catalog.Packages, *pkg)
	}
	return catalog, nil
}

func loadPackage(fsys fs.FS, entry Entry) (*Package, error) {
	if entry.Package != path.Base(entry.Package) || !strings.HasSuffix(entry.Package, ".tar.gz") {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid package file name %q", entry.Package)
	}
	archive, err := fs.ReadFile(fsys, entry.Package)
	if err != nil {
		return nil, err
	}
	if sum := sha256Hex(archive); sum != entry.SHA256 || len(archive) != entry.Size {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s has sha256 %s and %d bytes, the index lists %s and %d", entry.Package, sum, len(archive), entry.SHA256, entry.Size)
	}

	files, err := unpack(archive)
	if err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: %s", entry.Package, err.Error())
	}
	manifest, err := parseManifest(files)
	if err != nil {
		return nil, err
	}
	if manifest.ID != entry.ID || manifest.Version != entry.Version || manifest.ManifestVersion != entry.ManifestVersion {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "manifest declares %s@%s (manifest_version %d), the index lists %s@%s (manifest_version %d)", manifest.ID, manifest.Version, manifest.ManifestVersion, entry.ID, entry.Version, entry.ManifestVersion)
	}

	document, err := render(manifest, files)
	if err != nil {
		return nil, err
	}
	return &Package{ID: manifest.ID, Version: manifest.Version, Document: document}, nil
}

func unsupported(entry Entry, backendVersion string) string {
	if entry.ManifestVersion != ManifestVersion {
		return "unsupported manifest_version"
	}
	ok, err := satisfies(backendVersion, entry.FuseScope)
	if err != nil {
		return err.Error()
	}
	if !ok {
		return "requires fusescope " + entry.FuseScope
	}
	return ""
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
