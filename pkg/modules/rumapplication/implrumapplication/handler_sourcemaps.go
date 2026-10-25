package implrumapplication

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
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

// UploadR8Mapping takes the mapping as the raw body, gzip allowed, or as the
// file part of a multipart body with an optional release field.
func (h *handler) UploadR8Mapping(rw http.ResponseWriter, req *http.Request) {
	h.withOrgTimeout(rw, req, uploadTimeout, func(ctx context.Context, orgID valuer.UUID, claims *authtypes.Claims) (int, any, error) {
		id, err := valuer.NewUUID(mux.Vars(req)["id"])
		if err != nil {
			return 0, nil, err
		}

		release := req.URL.Query().Get(partRelease)
		content, err := r8MappingContent(req, &release)
		if err != nil {
			return 0, nil, err
		}
		defer func() { _ = content.Close() }()

		uploaded, err := h.module.UploadR8Mapping(ctx, orgID, id, release, claims.Email, content)
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

// r8MappingContent finds the mapping in the body. A multipart release field
// fills release when the query left it empty.
func r8MappingContent(req *http.Request, release *string) (io.ReadCloser, error) {
	mediaType, _, _ := mime.ParseMediaType(req.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		reader, err := req.MultipartReader()
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, rumtypes.ErrCodeSourceMapInvalidInput, "malformed multipart body")
		}
		parts := &multipartSourceMaps{reader: reader, debugIDs: map[string]string{}}
		part, err := parts.Next()
		if errors.Is(err, io.EOF) {
			return nil, errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "the multipart body has no file part with the mapping")
		}
		if err != nil {
			return nil, err
		}
		if *release == "" {
			*release = parts.release
		}
		return io.NopCloser(part.Content), nil
	}

	switch strings.ToLower(strings.TrimSpace(req.Header.Get("Content-Encoding"))) {
	case "", "identity":
		return req.Body, nil
	case "gzip":
		reader, err := gzip.NewReader(req.Body)
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, rumtypes.ErrCodeSourceMapInvalidInput, "invalid gzip body")
		}
		return reader, nil
	}
	return nil, errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "unsupported content encoding %q, use gzip or none", req.Header.Get("Content-Encoding"))
}

// rawFilename keeps the directories that multipart.Part.FileName strips.
func rawFilename(part *multipart.Part) string {
	_, params, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	if err != nil {
		return ""
	}
	return params["filename"]
}
