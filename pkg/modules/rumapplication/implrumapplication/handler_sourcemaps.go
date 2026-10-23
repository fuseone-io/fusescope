package implrumapplication

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
)

const (
	uploadTimeout     = 2 * time.Minute
	maxFormFieldBytes = 1 << 20
	partRelease       = "release"
	partDebugIDs      = "debug_ids"
	partFile          = "file"
)

// multipartSourceMaps reads an upload's parts: release and debug_ids are
// fields, a part named file carries its URL path as filename, and any other
// part is a map named by its URL path.
type multipartSourceMaps struct {
	reader   *multipart.Reader
	pending  *rumtypes.PostableSourceMap
	release  string
	debugIDs map[string]string
	done     bool
}

func (h *handler) UploadSourceMaps(rw http.ResponseWriter, req *http.Request) {
	h.withOrgTimeout(rw, req, uploadTimeout, func(ctx context.Context, orgID valuer.UUID, claims *authtypes.Claims) (int, any, error) {
		id, err := valuer.NewUUID(mux.Vars(req)["id"])
		if err != nil {
			return 0, nil, err
		}
		reader, err := req.MultipartReader()
		if err != nil {
			return 0, nil, errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "the body must be multipart/form-data with one part per source map")
		}

		parts := &multipartSourceMaps{reader: reader, debugIDs: map[string]string{}}
		first, err := parts.Next()
		if err != nil && !errors.Is(err, io.EOF) {
			return 0, nil, err
		}
		parts.pending = first

		release := req.URL.Query().Get(partRelease)
		if release == "" {
			release = parts.release
		}
		uploaded, err := h.module.UploadSourceMaps(ctx, orgID, id, release, claims.Email, parts)
		return http.StatusCreated, uploaded, err
	})
}

func (h *handler) ListSourceMaps(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		sourceMaps, err := h.module.ListSourceMaps(ctx, orgID, id, req.URL.Query().Get(partRelease))
		return http.StatusOK, sourceMaps, err
	})
}

func (h *handler) DeleteSourceMaps(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		return http.StatusNoContent, nil, h.module.DeleteSourceMapRelease(ctx, orgID, id, req.URL.Query().Get(partRelease))
	})
}

func (h *handler) DeleteSourceMap(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		fileID, err := valuer.NewUUID(mux.Vars(req)["fileId"])
		if err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, h.module.DeleteSourceMap(ctx, orgID, id, fileID)
	})
}

func (parts *multipartSourceMaps) Next() (*rumtypes.PostableSourceMap, error) {
	if pending := parts.pending; pending != nil {
		parts.pending = nil
		return pending, nil
	}
	if parts.done {
		return nil, io.EOF
	}

	for {
		part, err := parts.reader.NextPart()
		if errors.Is(err, io.EOF) {
			parts.done = true
			return nil, io.EOF
		}
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, rumtypes.ErrCodeSourceMapInvalidInput, "malformed multipart body")
		}

		switch name := part.FormName(); name {
		case "":
			continue
		case partRelease, partDebugIDs:
			if err := parts.readField(name, part); err != nil {
				return nil, err
			}
		case partFile:
			return &rumtypes.PostableSourceMap{Path: rawFilename(part), Content: part}, nil
		default:
			return &rumtypes.PostableSourceMap{Path: name, Content: part}, nil
		}
	}
}

func (parts *multipartSourceMaps) DebugIDs() map[string]string {
	return parts.debugIDs
}

func (parts *multipartSourceMaps) readField(name string, part *multipart.Part) error {
	value, err := io.ReadAll(io.LimitReader(part, maxFormFieldBytes+1))
	if err != nil {
		return errors.WrapInvalidInputf(err, rumtypes.ErrCodeSourceMapInvalidInput, "malformed multipart body")
	}
	if len(value) > maxFormFieldBytes {
		return errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "the %s field is larger than %d bytes", name, maxFormFieldBytes)
	}
	if name == partRelease {
		parts.release = string(value)
		return nil
	}
	debugIDs := map[string]string{}
	if err := json.Unmarshal(value, &debugIDs); err != nil {
		return errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "debug_ids must be a JSON object of URL path to debug ID")
	}
	for path, debugID := range debugIDs {
		parts.debugIDs[path] = debugID
	}
	return nil
}

// rawFilename keeps the directories that multipart.Part.FileName strips.
func rawFilename(part *multipart.Part) string {
	_, params, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	if err != nil {
		return ""
	}
	return params["filename"]
}
