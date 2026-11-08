package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderedImages(t *testing.T) {
	testCases := []struct {
		name     string
		manifest string
		images   []string
	}{
		{
			name: "ContainersAndInitContainers_Collected",
			manifest: `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      initContainers:
        - name: wait
          image: docker.io/busybox:1.35
      containers:
        - name: app
          image: "ghcr.io/fuseone-io/fusescope:0.161.0"
---
apiVersion: batch/v1
kind: Job
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/fuseone-io/fusescope-collector:0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077
`,
			images: []string{
				"docker.io/busybox:1.35",
				"ghcr.io/fuseone-io/fusescope-collector:0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077",
				"ghcr.io/fuseone-io/fusescope:0.161.0",
			},
		},
		{
			name: "Duplicates_ListedOnce",
			manifest: `spec:
  containers:
    - image: a:1
---
spec:
  containers:
    - image: a:1
`,
			images: []string{"a:1"},
		},
		{
			name: "NonStringImageAndEmptyDocuments_Ignored",
			manifest: `---
# Source: empty
---
spec:
  image:
    repository: not-a-reference
`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			images, err := renderedImages([]byte(testCase.manifest))
			require.NoError(t, err)
			assert.Equal(t, testCase.images, images)
		})
	}
}

func TestRenderedImages_InvalidYAML_Error(t *testing.T) {
	_, err := renderedImages([]byte("spec: [unclosed"))
	assert.Error(t, err)
}

func TestAGPLImages(t *testing.T) {
	testCases := []struct {
		name   string
		images []string
		agpl   []string
	}{
		{
			name: "DefaultInstall_Pass",
			images: []string{
				"docker.io/clickhouse/clickhouse-server:25.12.5",
				"ghcr.io/fuseone-io/fusescope:0.161.0",
				"ghcr.io/fuseone-io/fusescope-collector:0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077",
			},
		},
		{
			name:   "ForkCollector_Reported",
			images: []string{"ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0", "docker.io/busybox:1.35"},
			agpl:   []string{"ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0"},
		},
		{
			name:   "ForkCollectorByDigest_Reported",
			images: []string{"ghcr.io/fuseone-io/fusescope-otel-collector@sha256:abc"},
			agpl:   []string{"ghcr.io/fuseone-io/fusescope-otel-collector@sha256:abc"},
		},
		{
			name:   "ForkMigrator_Reported",
			images: []string{"ghcr.io/fuseone-io/fusescope-schema-migrator:0.145.0"},
			agpl:   []string{"ghcr.io/fuseone-io/fusescope-schema-migrator:0.145.0"},
		},
		{
			name:   "SimilarRepositoryName_Ignored",
			images: []string{"ghcr.io/fuseone-io/fusescope-otel-collector-docs:1", "ghcr.io/other/fusescope-otel-collector:1"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.agpl, agplImages(testCase.images))
		})
	}
}

func TestRepository(t *testing.T) {
	testCases := []struct {
		image      string
		repository string
	}{
		{image: "ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0", repository: "ghcr.io/fuseone-io/fusescope-otel-collector"},
		{image: "ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0@sha256:abc", repository: "ghcr.io/fuseone-io/fusescope-otel-collector"},
		{image: "localhost:5000/fusescope-otel-collector", repository: "localhost:5000/fusescope-otel-collector"},
		{image: "localhost:5000/fusescope-otel-collector:1", repository: "localhost:5000/fusescope-otel-collector"},
		{image: "busybox", repository: "busybox"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.image, func(t *testing.T) {
			assert.Equal(t, testCase.repository, repository(testCase.image))
		})
	}
}
