package catalog

import (
	"bytes"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"gopkg.in/yaml.v3"
)

const (
	// ManifestVersion is the manifest format this backend reads.
	ManifestVersion = 1
	ManifestFile    = "manifest.yaml"
)

// Manifest is a package's manifest.yaml. The schema lives in
// fuseone-io/fusescope-integrations, which validates every package before
// it is released.
type Manifest struct {
	ManifestVersion int             `yaml:"manifest_version"`
	ID              string          `yaml:"id"`
	Version         string          `yaml:"version"`
	FuseScope       string          `yaml:"fusescope"`
	Title           string          `yaml:"title"`
	Description     string          `yaml:"description"`
	Author          Author          `yaml:"author"`
	Icon            string          `yaml:"icon"`
	Categories      []string        `yaml:"categories"`
	Signals         []string        `yaml:"signals"`
	Overview        string          `yaml:"overview"`
	Configuration   []ConfigStepRef `yaml:"configuration"`
	Assets          AssetRefs       `yaml:"assets"`
	DataCollected   string          `yaml:"data_collected"`
	ConnectionTests ConnectionTests `yaml:"connection_tests"`
}

type Author struct {
	Name     string `yaml:"name" json:"name"`
	Email    string `yaml:"email" json:"email"`
	HomePage string `yaml:"homepage" json:"homepage"`
}

type ConfigStepRef struct {
	Title        string `yaml:"title"`
	Instructions string `yaml:"instructions"`
}

// AssetRefs keeps nil and empty lists apart: the API serves an omitted list as
// null and an empty one as [].
type AssetRefs struct {
	Logs       LogAssetRefs   `yaml:"logs"`
	Dashboards []DashboardRef `yaml:"dashboards"`
	Alerts     []string       `yaml:"alerts"`
}

type LogAssetRefs struct {
	Pipelines []string `yaml:"pipelines"`
}

type DashboardRef struct {
	ID         string `yaml:"id"`
	Definition string `yaml:"definition"`
}

type ConnectionTests struct {
	Logs *LogsConnectionTest `yaml:"logs"`
}

type LogsConnectionTest struct {
	AttributeKey   string `yaml:"attribute_key" json:"attribute_key"`
	AttributeValue string `yaml:"attribute_value" json:"attribute_value"`
}

func parseManifest(files map[string][]byte) (*Manifest, error) {
	raw, ok := files[ManifestFile]
	if !ok {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s is missing", ManifestFile)
	}
	var manifest Manifest
	dec := yaml.NewDecoder(bytes.NewReader(raw))
	dec.KnownFields(true)
	if err := dec.Decode(&manifest); err != nil {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: %s", ManifestFile, err.Error())
	}
	return &manifest, nil
}
