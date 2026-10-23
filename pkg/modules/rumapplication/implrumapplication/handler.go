package implrumapplication

import (
	"context"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/http/binding"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
)

const handlerTimeout = 10 * time.Second

type handler struct {
	module rumapplication.Module
}

func NewHandler(module rumapplication.Module) rumapplication.Handler {
	return &handler{module: module}
}

func (h *handler) List(rw http.ResponseWriter, req *http.Request) {
	h.withOrg(rw, req, func(ctx context.Context, orgID valuer.UUID, _ *authtypes.Claims) (int, any, error) {
		applications, err := h.module.List(ctx, orgID)
		return http.StatusOK, applications, err
	})
}

func (h *handler) Get(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		application, err := h.module.Get(ctx, orgID, id)
		return http.StatusOK, application, err
	})
}

func (h *handler) Create(rw http.ResponseWriter, req *http.Request) {
	h.withOrg(rw, req, func(ctx context.Context, orgID valuer.UUID, claims *authtypes.Claims) (int, any, error) {
		postable := new(rumtypes.PostableApplication)
		if err := binding.JSON.BindBody(req.Body, postable); err != nil {
			return 0, nil, err
		}
		created, err := h.module.Create(ctx, orgID, claims.Email, postable)
		return http.StatusCreated, created, err
	})
}

func (h *handler) Update(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		updatable := new(rumtypes.UpdatableApplication)
		if err := binding.JSON.BindBody(req.Body, updatable); err != nil {
			return 0, nil, err
		}
		application, err := h.module.Update(ctx, orgID, id, updatable)
		return http.StatusOK, application, err
	})
}

func (h *handler) Delete(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		return http.StatusNoContent, nil, h.module.Delete(ctx, orgID, id)
	})
}

func (h *handler) Status(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		status, err := h.module.Status(ctx, orgID, id)
		return http.StatusOK, status, err
	})
}

func (h *handler) ListKeys(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		keys, err := h.module.ListKeys(ctx, orgID, id)
		return http.StatusOK, keys, err
	})
}

func (h *handler) CreateKey(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		key, err := h.module.CreateKey(ctx, orgID, id)
		return http.StatusCreated, key, err
	})
}

func (h *handler) RotateKey(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		keyID, err := valuer.NewUUID(mux.Vars(req)["keyId"])
		if err != nil {
			return 0, nil, err
		}
		postable := new(rumtypes.PostableRotateApplicationKey)
		if err := binding.JSON.BindBody(req.Body, postable); err != nil {
			return 0, nil, err
		}
		key, err := h.module.RotateKey(ctx, orgID, id, keyID, postable.Overlap)
		return http.StatusCreated, key, err
	})
}

func (h *handler) RevokeKey(rw http.ResponseWriter, req *http.Request) {
	h.withApplication(rw, req, func(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (int, any, error) {
		keyID, err := valuer.NewUUID(mux.Vars(req)["keyId"])
		if err != nil {
			return 0, nil, err
		}
		return http.StatusNoContent, nil, h.module.RevokeKey(ctx, orgID, id, keyID)
	})
}

func (h *handler) withOrg(rw http.ResponseWriter, req *http.Request, serve func(context.Context, valuer.UUID, *authtypes.Claims) (int, any, error)) {
	h.withOrgTimeout(rw, req, handlerTimeout, serve)
}

func (h *handler) withOrgTimeout(rw http.ResponseWriter, req *http.Request, timeout time.Duration, serve func(context.Context, valuer.UUID, *authtypes.Claims) (int, any, error)) {
	ctx, cancel := context.WithTimeout(req.Context(), timeout)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	status, data, err := serve(ctx, valuer.MustNewUUID(claims.OrgID), &claims)
	if err != nil {
		render.Error(rw, err)
		return
	}
	render.Success(rw, status, data)
}

func (h *handler) withApplication(rw http.ResponseWriter, req *http.Request, serve func(context.Context, valuer.UUID, valuer.UUID) (int, any, error)) {
	h.withOrg(rw, req, func(ctx context.Context, orgID valuer.UUID, _ *authtypes.Claims) (int, any, error) {
		id, err := valuer.NewUUID(mux.Vars(req)["id"])
		if err != nil {
			return 0, nil, err
		}
		return serve(ctx, orgID, id)
	})
}
