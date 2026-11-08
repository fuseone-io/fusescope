package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"

	"gopkg.in/yaml.v3"
)

// agplRepositories are the image repositories built from fusescope-otel-collector,
// whose images label org.opencontainers.image.licenses AGPL-3.0
// (docs/adr/0001-agpl-collector-dependency.md).
var agplRepositories = []string{
	"ghcr.io/fuseone-io/fusescope-otel-collector",
	"ghcr.io/fuseone-io/fusescope-schema-migrator",
}

// renderedImages returns the sorted, distinct string values of every "image"
// key in a multi-document manifest, as helm template prints it.
func renderedImages(manifest []byte) ([]string, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(manifest))
	seen := map[string]bool{}
	for {
		var document yaml.Node
		err := decoder.Decode(&document)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("decode manifest: %w", err)
		}
		collectImages(&document, seen)
	}

	images := make([]string, 0, len(seen))
	for image := range seen {
		images = append(images, image)
	}
	slices.Sort(images)
	if len(images) == 0 {
		return nil, nil
	}
	return images, nil
}

func collectImages(node *yaml.Node, seen map[string]bool) {
	if node.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(node.Content); i += 2 {
			key, value := node.Content[i], node.Content[i+1]
			if key.Value == "image" && value.Kind == yaml.ScalarNode && value.Value != "" {
				seen[value.Value] = true
			}
		}
	}
	for _, child := range node.Content {
		collectImages(child, seen)
	}
}

// agplImages returns the images whose repository is in agplRepositories.
func agplImages(images []string) []string {
	var agpl []string
	for _, image := range images {
		if slices.Contains(agplRepositories, repository(image)) {
			agpl = append(agpl, image)
		}
	}
	slices.Sort(agpl)
	return agpl
}

// repository strips the digest and the tag from an image reference. A colon
// after the last slash starts the tag; one before it belongs to a registry port.
func repository(image string) string {
	if at := strings.IndexByte(image, '@'); at >= 0 {
		image = image[:at]
	}
	if colon := strings.LastIndexByte(image, ':'); colon > strings.LastIndexByte(image, '/') {
		image = image[:colon]
	}
	return image
}
