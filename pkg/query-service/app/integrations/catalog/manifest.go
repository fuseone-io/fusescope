package catalog

import (
	"bytes"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"gopkg.in/yaml.v3"
)

const ManifestFile = "manifest.yaml"

// The manifest formats this backend reads. A backend skips a package whose
// format it does not read, by the catalog index, before decoding it.
//   - 1: alerts are definition files, listed and not provisioned.
//   - 2: alerts are {id, definition}, provisioned and owned by their id.
const (
	ManifestVersion1 = 1
	ManifestVersion2 = 2
)

func supportedManifestVersion(v int) bool {
	return v == ManifestVersion1 || v == ManifestVersion2
}

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
	Alerts     []AlertRef     `yaml:"alerts"`
}

type LogAssetRefs struct {
	Pipelines []string `yaml:"pipelines"`
}

type DashboardRef struct {
	ID         string `yaml:"id"`
	Definition string `yaml:"definition"`
}

// AlertRef is an alert rule a manifest lists: in version 1 a definition
// file, in version 2 {id, definition}, the id stable across the
// integration's versions so installations own the rule by it.
type AlertRef struct {
	ID         string
	Definition string
	// file is true for the version 1 form.
	file bool
}

func (ref *AlertRef) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		ref.file = true
		return node.Decode(&ref.Definition)
	}
	var fields struct {
		ID         string `yaml:"id"`
		Definition string `yaml:"definition"`
	}
	if node.Kind != yaml.MappingNode {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "line %d: an alert is a definition file or {id, definition}", node.Line)
	}
	for i := 0; i < len(node.Content); i += 2 {
		if key := node.Content[i].Value; key != "id" && key != "definition" {
			return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "line %d: field %s not found in alert", node.Content[i].Line, key)
		}
	}
	if err := node.Decode(&fields); err != nil {
		return err
	}
	ref.ID, ref.Definition = fields.ID, fields.Definition
	return nil
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
	if err := manifest.validateAlerts(); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// validateAlerts holds each manifest version to its form of alerts.
func (m *Manifest) validateAlerts() error {
	seen := map[string]bool{}
	for _, ref := range m.Assets.Alerts {
		switch {
		case m.ManifestVersion == ManifestVersion1 && !ref.file:
			return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: manifest_version 1 lists alerts as definition files; {id, definition} needs manifest_version 2", ManifestFile)
		case m.ManifestVersion == ManifestVersion1:
			continue
		case ref.file:
			return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: manifest_version %d lists alerts as {id, definition}, not %q", ManifestFile, m.ManifestVersion, ref.Definition)
		case ref.ID == "" || ref.Definition == "":
			return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: an alert needs an id and a definition", ManifestFile)
		case seen[ref.ID]:
			return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s: alert id %s is listed twice", ManifestFile, ref.ID)
		}
		seen[ref.ID] = true
	}
	return nil
}
