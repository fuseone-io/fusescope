package implrumapplication

import (
	"context"
	"net/http"
	"net/url"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/binding"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
)

func (h *handler) ListViews(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		params := new(rumtypes.ListViewsParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		views, err := h.module.ListViews(ctx, orgID, id, params)
		return http.StatusOK, views, err
	})
}

func (h *handler) GetView(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		route, err := pathValue(req, "route")
		if err != nil {
			return 0, nil, err
		}
		params := new(rumtypes.GetViewParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		view, err := h.module.GetView(ctx, orgID, id, route, params)
		return http.StatusOK, view, err
	})
}

func (h *handler) ListErrorGroups(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		params := new(rumtypes.ListErrorGroupsParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		groups, err := h.module.ListErrorGroups(ctx, orgID, id, params)
		return http.StatusOK, groups, err
	})
}

func (h *handler) GetErrorGroup(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		params := new(rumtypes.GetErrorGroupParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		group, err := h.module.GetErrorGroup(ctx, orgID, id, mux.Vars(req)["fingerprint"], params)
		return http.StatusOK, group, err
	})
}

func (h *handler) ListSessions(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		params := new(rumtypes.ListSessionsParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		sessions, err := h.module.ListSessions(ctx, orgID, id, params)
		return http.StatusOK, sessions, err
	})
}

func (h *handler) GetSession(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		sessionID, err := pathValue(req, "sessionId")
		if err != nil {
			return 0, nil, err
		}
		params := new(rumtypes.GetSessionParams)
		if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
			return 0, nil, err
		}
		session, err := h.module.GetSession(ctx, orgID, id, sessionID, params)
		return http.StatusOK, session, err
	})
}

// pathValue decodes a path variable; the router matches on the encoded path,
// so a route template travels as e.g. %2Fproduct%2F%3Aid.
func pathValue(req *http.Request, name string) (string, error) {
	value, err := url.PathUnescape(mux.Vars(req)[name])
	if err != nil {
		return "", errors.NewInvalidInputf(rumtypes.ErrCodeQueryInvalidInput, "%s is not a valid path segment", name)
	}
	return value, nil
}
