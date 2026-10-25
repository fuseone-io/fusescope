package implrumapplication

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type testSourceMapParts struct {
	maps     []*rumtypes.PostableSourceMap
	debugIDs map[string]string
}

func (parts *testSourceMapParts) Next() (*rumtypes.PostableSourceMap, error) {
	if len(parts.maps) == 0 {
		return nil, io.EOF
	}
	next := parts.maps[0]
	parts.maps = parts.maps[1:]
	return next, nil
}

func (parts *testSourceMapParts) DebugIDs() map[string]string {
	return parts.debugIDs
}

func newTestParts(debugIDs map[string]string, pathsAndContents ...string) *testSourceMapParts {
	parts := &testSourceMapParts{debugIDs: debugIDs}
	for i := 0; i+1 < len(pathsAndContents); i += 2 {
		parts.maps = append(parts.maps, &rumtypes.PostableSourceMap{Path: pathsAndContents[i], Content: strings.NewReader(pathsAndContents[i+1])})
	}
	return parts
}

func readFixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "types", "rumtypes", "testdata", "sourcemap", name))
	require.NoError(t, err)
	return string(data)
}

func storedContentCount(t *testing.T, module *module) int {
	t.Helper()
	count := 0
	_ = filepath.WalkDir(module.config.SourceMaps.Dir, func(_ string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			count++
		}
		return nil
	})
	return count
}

func createTestApplication(t *testing.T, module *module, orgID valuer.UUID, extra string) valuer.UUID {
	t.Helper()
	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop`+valuer.GenerateUUID().StringValue()[24:]+`","platform":"web","environment":"production"`+extra+`}`))
	require.NoError(t, err)
	return created.ID
}

func TestModuleSourceMapsLifecycle(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestApplication(t, module, orgID, "")
	fixture := readFixture(t, "main.js.map")

	uploaded, err := module.UploadSourceMaps(ctx, orgID, id, "1.8.0", "ci@example.com", newTestParts(nil, "assets/main.js.map", fixture, "/assets/bad.js.map", `{"version":2}`, "/", fixture))
	require.NoError(t, err)
	require.Len(t, uploaded.Files, 1)
	assert.Equal(t, "/assets/main.js.map", uploaded.Files[0].Path)
	assert.Equal(t, "/assets/main.js", uploaded.Files[0].GeneratedPath)
	assert.Equal(t, int64(len(fixture)), uploaded.Files[0].SizeBytes)
	assert.Equal(t, "ci@example.com", uploaded.Files[0].UploadedBy)
	require.Len(t, uploaded.Rejected, 2)
	assert.Equal(t, "/assets/bad.js.map", uploaded.Rejected[0].Path)
	assert.Contains(t, uploaded.Rejected[0].Reason, "version")
	assert.Equal(t, "/", uploaded.Rejected[1].Path)
	assert.Zero(t, uploaded.Replaced)

	replaced, err := module.UploadSourceMaps(ctx, orgID, id, "1.8.0", "jane@example.com", newTestParts(nil, "/assets/main.js.map", fixture))
	require.NoError(t, err)
	assert.Equal(t, int64(1), replaced.Replaced)
	assert.Equal(t, 1, storedContentCount(t, module), "the replaced content is deleted")

	_, err = module.UploadSourceMaps(ctx, orgID, id, "1.7.4", "ci@example.com", newTestParts(nil, "/assets/main.js.map", fixture, "/assets/other.js.map", fixture))
	require.NoError(t, err)

	listed, err := module.ListSourceMaps(ctx, orgID, id, "")
	require.NoError(t, err)
	require.Len(t, listed.Releases, 2)
	assert.Equal(t, "1.7.4", listed.Releases[0].Release)
	assert.Equal(t, int64(2), listed.Releases[0].Files)
	assert.Equal(t, "1.8.0", listed.Releases[1].Release)
	assert.Equal(t, "jane@example.com", listed.Releases[1].UploadedBy)
	assert.Equal(t, int64(3*len(fixture)), listed.SizeBytes)
	assert.Empty(t, listed.Files)
	assert.Equal(t, rumtypes.SourceMapLimits{MaxFileSize: 50 << 20, MaxFilesPerRelease: 1000, Quota: 2 << 30}, listed.Limits)
	assert.Equal(t, rumtypes.NewDefaultSourceMapSettings(), listed.Settings)

	release, err := module.ListSourceMaps(ctx, orgID, id, "1.7.4")
	require.NoError(t, err)
	require.Len(t, release.Releases, 1)
	require.Len(t, release.Files, 2)
	assert.Equal(t, "/assets/main.js.map", release.Files[0].Path)

	_, err = module.ListSourceMaps(ctx, orgID, id, "9.9.9")
	assert.True(t, errors.Ast(err, errors.TypeNotFound), err)
	_, err = module.ListSourceMaps(ctx, valuer.GenerateUUID(), id, "")
	assert.True(t, errors.Ast(err, errors.TypeNotFound), err, "another organization does not see the maps")

	require.NoError(t, module.DeleteSourceMap(ctx, orgID, id, release.Files[1].ID))
	assert.True(t, errors.Ast(module.DeleteSourceMap(ctx, orgID, id, release.Files[1].ID), errors.TypeNotFound))
	require.NoError(t, module.DeleteSourceMapRelease(ctx, orgID, id, "1.7.4"))
	assert.True(t, errors.Ast(module.DeleteSourceMapRelease(ctx, orgID, id, "1.7.4"), errors.TypeNotFound))
	assert.True(t, errors.Ast(module.DeleteSourceMapRelease(ctx, orgID, id, ""), errors.TypeInvalidInput))
	assert.Equal(t, 1, storedContentCount(t, module))

	require.NoError(t, module.Delete(ctx, orgID, id))
	assert.Zero(t, storedContentCount(t, module), "deleting the application deletes its maps")
}

func TestModuleUploadSourceMapsLimits(t *testing.T) {
	fixture := readFixture(t, "main.js.map")
	size := int64(len(fixture))

	testCases := []struct {
		name      string
		configure func(*rumapplication.Config)
		release   string
		parts     func() *testSourceMapParts
		errType   string
		rejected  int
		stored    int
	}{
		{name: "QuotaExceeded_PayloadTooLarge_NothingStored", configure: func(c *rumapplication.Config) { c.SourceMaps.Quota = 2*size - 1 }, release: "1.0.0", parts: func() *testSourceMapParts {
			return newTestParts(nil, "/a.js.map", fixture, "/b.js.map", fixture)
		}, errType: "too-large"},
		{name: "TooManyFiles_InvalidInput_NothingStored", configure: func(c *rumapplication.Config) { c.SourceMaps.MaxFilesPerRelease = 1 }, release: "1.0.0", parts: func() *testSourceMapParts {
			return newTestParts(nil, "/a.js.map", fixture, "/b.js.map", fixture)
		}, errType: "invalid"},
		{name: "FileTooLarge_Rejected", configure: func(c *rumapplication.Config) { c.SourceMaps.MaxFileSize = size - 1 }, release: "1.0.0", parts: func() *testSourceMapParts {
			return newTestParts(nil, "/a.js.map", fixture)
		}, rejected: 1},
		{name: "NotJSON_Rejected", configure: func(*rumapplication.Config) {}, release: "1.0.0", parts: func() *testSourceMapParts {
			return newTestParts(nil, "/a.js.map", "console.log(1)", "/b.js.map", fixture)
		}, rejected: 1, stored: 1},
		{name: "MissingRelease_InvalidInput", configure: func(*rumapplication.Config) {}, release: " ", parts: func() *testSourceMapParts {
			return newTestParts(nil, "/a.js.map", fixture)
		}, errType: "invalid"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			module, orgID, _ := newTestModuleWithConfig(t, false, testCase.configure)
			id := createTestApplication(t, module, orgID, "")

			uploaded, err := module.UploadSourceMaps(ctx, orgID, id, testCase.release, "ci@example.com", testCase.parts())
			switch testCase.errType {
			case "too-large":
				assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge), err)
			case "invalid":
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err)
			default:
				require.NoError(t, err)
				assert.Len(t, uploaded.Rejected, testCase.rejected)
				assert.Len(t, uploaded.Files, testCase.stored)
			}
			assert.Equal(t, testCase.stored, storedContentCount(t, module))
		})
	}
}

func TestModuleUploadSourceMapsDebugIDs(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestApplication(t, module, orgID, "")
	withDebugID := `{"version":3,"sources":[],"names":[],"mappings":"","debugId":"85314830-023F-4CF1-A267-535F4E37BB17"}`
	plain := `{"version":3,"sources":[],"names":[],"mappings":""}`

	uploaded, err := module.UploadSourceMaps(ctx, orgID, id, "1.0.0", "ci@example.com", newTestParts(
		map[string]string{"assets/b.js.map": "C2D1A1B0-0000-4000-8000-000000000001", "/c.js.map": "not-a-uuid"},
		"/a.js.map", withDebugID, "/assets/b.js.map", plain, "/c.js.map", plain,
	))
	require.NoError(t, err)
	require.Len(t, uploaded.Files, 3)
	assert.Equal(t, "85314830-023f-4cf1-a267-535f4e37bb17", uploaded.Files[0].DebugID)
	assert.Equal(t, "c2d1a1b0-0000-4000-8000-000000000001", uploaded.Files[1].DebugID)
	assert.Empty(t, uploaded.Files[2].DebugID)
}

func TestModuleSymbolicateUploadedSourceMap(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	id := createTestApplication(t, module, orgID, "")
	frames := rumtypes.ParseStackFrames(readFixture(t, "stack.txt"))

	missing, err := module.symbolicator.Symbolicate(ctx, id, "1.8.0", frames)
	require.NoError(t, err)
	assert.False(t, missing.Symbolicated)
	assert.Equal(t, &rumtypes.MissingSourceMap{Release: "1.8.0", Kind: rumtypes.ArtifactKindSourceMap}, missing.MissingSourceMap)

	_, err = module.UploadSourceMaps(ctx, orgID, id, "1.8.0", "ci@example.com", newTestParts(nil, "/assets/main.js.map", readFixture(t, "main.js.map")))
	require.NoError(t, err)

	testCases := []struct {
		name         string
		release      string
		symbolicated bool
		missing      *rumtypes.MissingSourceMap
		frames       []rumtypes.StackFrame
	}{
		{name: "ReleaseWithMap_Symbolicated", release: "1.8.0", symbolicated: true},
		{name: "ReleaseWithoutMap_Missing", release: "1.7.4", missing: &rumtypes.MissingSourceMap{Release: "1.7.4", Kind: rumtypes.ArtifactKindSourceMap}},
		{name: "NoRelease_Missing", release: "", missing: &rumtypes.MissingSourceMap{Kind: rumtypes.ArtifactKindSourceMap}},
		{name: "InlineScript_NeverMissing", release: "1.7.4", frames: []rumtypes.StackFrame{{Function: "onclick", File: "https://shop.example.com/checkout?step=2", Line: 12, Column: 3}, {Function: "", File: "<anonymous>"}}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			stack := frames
			if testCase.frames != nil {
				stack = testCase.frames
			}
			result, err := module.symbolicator.Symbolicate(ctx, id, testCase.release, stack)
			require.NoError(t, err)
			assert.Equal(t, testCase.symbolicated, result.Symbolicated)
			assert.Equal(t, testCase.missing, result.MissingSourceMap)
			if testCase.symbolicated {
				require.NotNil(t, result.Frames[0].Original)
				assert.Equal(t, "formatPrice", result.Frames[0].Original.Function)
				assert.Equal(t, "src/price.ts", result.Frames[0].Original.File)
				assert.Equal(t, 3, result.Frames[0].Original.Line)
				assert.Equal(t, "e", result.Frames[0].Function, "the minified frame is kept")
			}
		})
	}

	require.NoError(t, module.FlushUsage(ctx))
	listed, err := module.ListSourceMaps(ctx, orgID, id, "1.8.0")
	require.NoError(t, err)
	require.NotNil(t, listed.Releases[0].LastUsedAt)
	require.NotNil(t, listed.Files[0].LastUsedAt)

	require.NoError(t, module.DeleteSourceMapRelease(ctx, orgID, id, "1.8.0"))
	deleted, err := module.symbolicator.Symbolicate(ctx, id, "1.8.0", frames)
	require.NoError(t, err)
	assert.False(t, deleted.Symbolicated, "a delete is seen at once")
}

func TestModuleCleanupSourceMaps(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	expiring := createTestApplication(t, module, orgID, `,"sourceMaps":{"retention":"30d","keepNewestReleases":false}`)
	kept := createTestApplication(t, module, orgID, `,"sourceMaps":{"retention":"never"}`)
	old := time.Now().Add(-40 * 24 * time.Hour)

	for _, id := range []valuer.UUID{expiring, kept} {
		for _, release := range []string{"1.0.0", "2.0.0"} {
			file := rumtypes.NewStorableSourceMap(orgID, id, rumtypes.ArtifactKindSourceMap, release, "/a.js.map", "", 2, "ci@example.com", old)
			if release == "2.0.0" {
				file.TimeAuditable = types.TimeAuditable{CreatedAt: time.Now(), UpdatedAt: time.Now()}
			}
			require.NoError(t, module.storage.Put(ctx, file.StorageKey(), strings.NewReader("{}")))
			require.NoError(t, module.store.CreateSourceMaps(ctx, []*rumtypes.StorableSourceMap{file}))
		}
	}

	require.NoError(t, module.CleanupSourceMaps(ctx))

	expired, err := module.ListSourceMaps(ctx, orgID, expiring, "")
	require.NoError(t, err)
	require.Len(t, expired.Releases, 1)
	assert.Equal(t, "2.0.0", expired.Releases[0].Release)
	untouched, err := module.ListSourceMaps(ctx, orgID, kept, "")
	require.NoError(t, err)
	assert.Len(t, untouched.Releases, 2)
	assert.Equal(t, 3, storedContentCount(t, module))

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	assert.Error(t, module.CleanupSourceMaps(canceled))
}

func TestHandlerUploadSourceMapsMultipart(t *testing.T) {
	module, orgID := newTestModule(t)
	id := createTestApplication(t, module, orgID, "")
	fixture := readFixture(t, "main.js.map")

	testCases := []struct {
		name     string
		target   string
		write    func(writer *multipart.Writer)
		status   int
		paths    []string
		debugIDs []string
	}{
		{
			name:   "FieldNamedByPath_ReleaseInQuery_DebugIDsAfter",
			target: "/sourcemaps?release=1.8.0",
			write: func(writer *multipart.Writer) {
				part, _ := writer.CreateFormFile("/assets/index-abc.js.map", "index-abc.js.map")
				_, _ = part.Write([]byte(fixture))
				_ = writer.WriteField("debug_ids", `{"/assets/index-abc.js.map":"85314830-023f-4cf1-a267-535f4e37bb17"}`)
			},
			status:   http.StatusCreated,
			paths:    []string{"/assets/index-abc.js.map"},
			debugIDs: []string{"85314830-023f-4cf1-a267-535f4e37bb17"},
		},
		{
			name:   "FilePartWithDirectories_ReleaseField",
			target: "/sourcemaps",
			write: func(writer *multipart.Writer) {
				_ = writer.WriteField("release", "1.8.1")
				header := textproto.MIMEHeader{}
				header.Set("Content-Disposition", `form-data; name="file"; filename="assets/main.4f9c2a.js.map"`)
				part, _ := writer.CreatePart(header)
				_, _ = part.Write([]byte(fixture))
			},
			status:   http.StatusCreated,
			paths:    []string{"/assets/main.4f9c2a.js.map"},
			debugIDs: []string{""},
		},
		{name: "NoRelease_BadRequest", target: "/sourcemaps", write: func(writer *multipart.Writer) {
			part, _ := writer.CreateFormFile("/a.js.map", "a.js.map")
			_, _ = part.Write([]byte(fixture))
		}, status: http.StatusBadRequest},
		{name: "BadDebugIDs_BadRequest", target: "/sourcemaps?release=1", write: func(writer *multipart.Writer) {
			_ = writer.WriteField("debug_ids", `[1]`)
		}, status: http.StatusBadRequest},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			body := new(bytes.Buffer)
			writer := multipart.NewWriter(body)
			testCase.write(writer)
			require.NoError(t, writer.Close())

			req := httptest.NewRequest(http.MethodPost, testCase.target, body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			req = req.WithContext(authtypes.NewContextWithClaims(req.Context(), authtypes.Claims{OrgID: orgID.StringValue(), Email: "ci@example.com"}))
			req = mux.SetURLVars(req, map[string]string{"id": id.StringValue()})
			recorder := httptest.NewRecorder()
			NewHandler(module).UploadSourceMaps(recorder, req)

			require.Equal(t, testCase.status, recorder.Code, recorder.Body.String())
			if testCase.status != http.StatusCreated {
				return
			}
			response := struct {
				Data rumtypes.GettableUploadedSourceMaps `json:"data"`
			}{}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			paths, debugIDs := []string{}, []string{}
			for _, file := range response.Data.Files {
				paths, debugIDs = append(paths, file.Path), append(debugIDs, file.DebugID)
			}
			assert.Equal(t, testCase.paths, paths)
			assert.Equal(t, testCase.debugIDs, debugIDs)
		})
	}
}
