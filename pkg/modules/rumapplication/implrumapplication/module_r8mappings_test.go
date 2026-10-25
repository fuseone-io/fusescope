package implrumapplication

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readR8Fixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "types", "rumtypes", "testdata", "r8", name))
	require.NoError(t, err)
	return string(data)
}

func createTestAndroidApplication(t *testing.T, module *module, orgID valuer.UUID) valuer.UUID {
	t.Helper()
	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop-android`+valuer.GenerateUUID().StringValue()[24:]+`","platform":"android","environment":"production","allowedPackageNames":["com.example.shop"]}`))
	require.NoError(t, err)
	return created.ID
}

func TestModuleUploadR8Mapping(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	mapping := readR8Fixture(t, "mapping.txt")

	uploaded, err := module.UploadR8Mapping(ctx, orgID, id, "2.1.0", "ci@example.com", strings.NewReader(mapping))
	require.NoError(t, err)
	assert.Equal(t, "2.1.0", uploaded.Release)
	require.Len(t, uploaded.Files, 1)
	assert.Equal(t, rumtypes.ArtifactKindR8Mapping, uploaded.Files[0].Kind)
	assert.Equal(t, rumtypes.R8MappingPath, uploaded.Files[0].Path)
	assert.Equal(t, "7e4c1a9", uploaded.Files[0].DebugID, "the pg_map_id")
	assert.Equal(t, int64(len(mapping)), uploaded.Files[0].SizeBytes)
	assert.Zero(t, uploaded.Replaced)

	again, err := module.UploadR8Mapping(ctx, orgID, id, "2.1.0", "ci@example.com", strings.NewReader(mapping))
	require.NoError(t, err)
	assert.Equal(t, int64(1), again.Replaced, "a release holds one mapping")
	assert.Equal(t, 1, storedContentCount(t, module))

	listed, err := module.ListSourceMaps(ctx, orgID, id, "2.1.0")
	require.NoError(t, err)
	require.Len(t, listed.Files, 1)
	assert.Equal(t, rumtypes.ArtifactKindR8Mapping, listed.Files[0].Kind)
	assert.Equal(t, "ci@example.com", listed.Releases[0].UploadedBy)
}

func TestModuleUploadR8MappingRejects(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	android := createTestAndroidApplication(t, module, orgID)
	web := createTestApplication(t, module, orgID, "")

	testCases := []struct {
		name    string
		upload  func() error
		message string
	}{
		{name: "NotAMapping_Rejected", upload: func() error {
			_, err := module.UploadR8Mapping(ctx, orgID, android, "2.1.0", "ci@example.com", strings.NewReader(`{"version":3}`))
			return err
		}, message: "mapping line 1"},
		{name: "Empty_Rejected", upload: func() error {
			_, err := module.UploadR8Mapping(ctx, orgID, android, "2.1.0", "ci@example.com", strings.NewReader(""))
			return err
		}, message: "empty"},
		{name: "NoRelease_Rejected", upload: func() error {
			_, err := module.UploadR8Mapping(ctx, orgID, android, " ", "ci@example.com", strings.NewReader(readR8Fixture(t, "mapping.txt")))
			return err
		}, message: "release"},
		{name: "WebApplication_Rejected", upload: func() error {
			_, err := module.UploadR8Mapping(ctx, orgID, web, "2.1.0", "ci@example.com", strings.NewReader(readR8Fixture(t, "mapping.txt")))
			return err
		}, message: "android"},
		{name: "SourceMapToAndroid_Rejected", upload: func() error {
			_, err := module.UploadSourceMaps(ctx, orgID, android, "2.1.0", "ci@example.com", newTestParts(nil, "/assets/main.js.map", readFixture(t, "main.js.map")))
			return err
		}, message: "R8 mapping"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := testCase.upload()
			require.Error(t, err)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err.Error())
			_, _, message, _, _, _ := errors.Unwrapb(err)
			assert.Contains(t, message, testCase.message)
		})
	}
	assert.Zero(t, storedContentCount(t, module))
}

func TestModuleRetraceUploadedR8Mapping(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	trace := rumtypes.ParseJVMStackTrace(readR8Fixture(t, "crash.txt"), "", "")

	missing, err := module.symbolicator.Retrace(ctx, id, "2.1.0", trace)
	require.NoError(t, err)
	assert.False(t, missing.Retraced)
	assert.Same(t, trace, missing.Trace)
	assert.Equal(t, &rumtypes.MissingSourceMap{Release: "2.1.0", Kind: rumtypes.ArtifactKindR8Mapping}, missing.MissingSourceMap)

	_, err = module.UploadR8Mapping(ctx, orgID, id, "2.1.0", "ci@example.com", strings.NewReader(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		release  string
		retraced bool
		missing  *rumtypes.MissingSourceMap
	}{
		{name: "ReleaseWithMapping_Retraced", release: "2.1.0", retraced: true},
		{name: "ReleaseWithoutMapping_Missing", release: "2.0.0", missing: &rumtypes.MissingSourceMap{Release: "2.0.0", Kind: rumtypes.ArtifactKindR8Mapping}},
		{name: "NoRelease_Missing", release: "", missing: &rumtypes.MissingSourceMap{Kind: rumtypes.ArtifactKindR8Mapping}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := module.symbolicator.Retrace(ctx, id, testCase.release, trace)
			require.NoError(t, err)
			assert.Equal(t, testCase.retraced, result.Retraced)
			assert.Equal(t, testCase.missing, result.MissingSourceMap)
			if testCase.retraced {
				assert.Equal(t, "com.example.shop.CartException", result.Trace.Exceptions[0].Type)
				require.NotNil(t, result.Trace.Exceptions[0].Frames[0].Original)
				assert.Equal(t, "Item.kt", result.Trace.Exceptions[0].Frames[0].Original.File)
			}
		})
	}

	require.NoError(t, module.FlushUsage(ctx))
	listed, err := module.ListSourceMaps(ctx, orgID, id, "2.1.0")
	require.NoError(t, err)
	require.NotNil(t, listed.Files[0].LastUsedAt)

	require.NoError(t, module.DeleteSourceMapRelease(ctx, orgID, id, "2.1.0"))
	deleted, err := module.symbolicator.Retrace(ctx, id, "2.1.0", trace)
	require.NoError(t, err)
	assert.False(t, deleted.Retraced, "a delete is seen at once")
}

func TestHandlerUploadR8Mapping(t *testing.T) {
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	mapping := readR8Fixture(t, "mapping.txt")
	compressed := new(bytes.Buffer)
	gzipWriter := gzip.NewWriter(compressed)
	_, _ = gzipWriter.Write([]byte(mapping))
	require.NoError(t, gzipWriter.Close())

	testCases := []struct {
		name    string
		target  string
		body    func() (*bytes.Buffer, map[string]string)
		status  int
		release string
	}{
		{name: "RawBody_ReleaseInQuery", target: "/mappings?release=2.1.0", body: func() (*bytes.Buffer, map[string]string) {
			return bytes.NewBufferString(mapping), map[string]string{"Content-Type": "text/plain"}
		}, status: http.StatusCreated, release: "2.1.0"},
		{name: "GzipBody", target: "/mappings?release=2.1.1", body: func() (*bytes.Buffer, map[string]string) {
			return bytes.NewBuffer(compressed.Bytes()), map[string]string{"Content-Type": "application/octet-stream", "Content-Encoding": "gzip"}
		}, status: http.StatusCreated, release: "2.1.1"},
		{name: "Multipart_ReleaseField", target: "/mappings", body: func() (*bytes.Buffer, map[string]string) {
			body := new(bytes.Buffer)
			writer := multipart.NewWriter(body)
			_ = writer.WriteField("release", "2.1.2")
			part, _ := writer.CreateFormFile("file", "mapping.txt")
			_, _ = part.Write([]byte(mapping))
			_ = writer.Close()
			return body, map[string]string{"Content-Type": writer.FormDataContentType()}
		}, status: http.StatusCreated, release: "2.1.2"},
		{name: "NoRelease_BadRequest", target: "/mappings", body: func() (*bytes.Buffer, map[string]string) {
			return bytes.NewBufferString(mapping), map[string]string{"Content-Type": "text/plain"}
		}, status: http.StatusBadRequest},
		{name: "BadGzip_BadRequest", target: "/mappings?release=2", body: func() (*bytes.Buffer, map[string]string) {
			return bytes.NewBufferString(mapping), map[string]string{"Content-Encoding": "gzip"}
		}, status: http.StatusBadRequest},
		{name: "NotAMapping_BadRequest", target: "/mappings?release=2", body: func() (*bytes.Buffer, map[string]string) {
			return bytes.NewBufferString("hello"), map[string]string{"Content-Type": "text/plain"}
		}, status: http.StatusBadRequest},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			body, headers := testCase.body()
			req := httptest.NewRequest(http.MethodPost, testCase.target, body)
			for key, value := range headers {
				req.Header.Set(key, value)
			}
			req = req.WithContext(authtypes.NewContextWithClaims(req.Context(), authtypes.Claims{OrgID: orgID.StringValue(), Email: "ci@example.com"}))
			req = mux.SetURLVars(req, map[string]string{"id": id.StringValue()})
			recorder := httptest.NewRecorder()
			NewHandler(module).UploadR8Mapping(recorder, req)

			require.Equal(t, testCase.status, recorder.Code, recorder.Body.String())
			if testCase.status != http.StatusCreated {
				return
			}
			response := struct {
				Data rumtypes.GettableUploadedSourceMaps `json:"data"`
			}{}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, testCase.release, response.Data.Release)
			require.Len(t, response.Data.Files, 1)
			assert.Equal(t, int64(len(mapping)), response.Data.Files[0].SizeBytes)
		})
	}
}
