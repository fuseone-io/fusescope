package catalog

import (
	"encoding/base64"
	"encoding/json"
	"path"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// render inlines the files a manifest references into the integration
// document: markdown as text, JSON files as objects, the icon as a data URI.
// JSON files go through map[string]any, as the backend has always decoded
// them, so the API serves the same bytes.
func render(m *Manifest, files map[string][]byte) ([]byte, error) {
	r := renderer{files: files}

	configuration := make([]any, 0, len(m.Configuration))
	for _, step := range m.Configuration {
		configuration = append(configuration, map[string]any{"title": step.Title, "instructions": r.text(step.Instructions)})
	}

	var dashboards []any
	if m.Assets.Dashboards != nil {
		dashboards = make([]any, 0, len(m.Assets.Dashboards))
		for _, ref := range m.Assets.Dashboards {
			dashboards = append(dashboards, map[string]any{"id": ref.ID, "definition": r.object(ref.Definition)})
		}
	}

	document := map[string]any{
		"id":            m.ID,
		"title":         m.Title,
		"description":   m.Description,
		"author":        m.Author,
		"icon":          r.dataURI(m.Icon),
		"categories":    m.Categories,
		"overview":      r.text(m.Overview),
		"configuration": configuration,
		"assets": map[string]any{
			"logs":       map[string]any{"pipelines": r.objects(m.Assets.Logs.Pipelines)},
			"dashboards": dashboards,
			"alerts":     r.objects(m.Assets.Alerts),
		},
		"connection_tests": map[string]any{"logs": m.ConnectionTests.Logs},
		"data_collected":   r.object(m.DataCollected),
	}
	if r.err != nil {
		return nil, r.err
	}
	return json.Marshal(document)
}

// renderer keeps the first error, so render reads as a plain list of fields.
type renderer struct {
	files map[string][]byte
	err   error
}

func (r *renderer) read(name string) []byte {
	if r.err != nil {
		return nil
	}
	content, ok := r.files[name]
	if !ok {
		r.err = errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "the manifest references %q, which the package does not hold", name)
	}
	return content
}

func (r *renderer) text(name string) string {
	return string(r.read(name))
}

func (r *renderer) object(name string) map[string]any {
	content := r.read(name)
	if r.err != nil {
		return nil
	}
	var object map[string]any
	if err := json.Unmarshal(content, &object); err != nil {
		r.err = errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s must hold one JSON object: %s", name, err.Error())
	}
	return object
}

func (r *renderer) objects(names []string) []any {
	if names == nil {
		return nil
	}
	objects := make([]any, 0, len(names))
	for _, name := range names {
		objects = append(objects, r.object(name))
	}
	return objects
}

func (r *renderer) dataURI(name string) string {
	var mime string
	switch path.Ext(name) {
	case ".svg":
		mime = "image/svg+xml"
	case ".png":
		mime = "image/png"
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	default:
		if r.err == nil {
			r.err = errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "unsupported icon type %q", name)
		}
		return ""
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(r.read(name))
}
