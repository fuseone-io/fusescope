package implonboarding

import (
	"context"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/http/binding"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/onboarding"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const handlerTimeout = 10 * time.Second

type handler struct {
	module onboarding.Module
}

func NewHandler(module onboarding.Module) onboarding.Handler {
	return &handler{module: module}
}

func (h *handler) GetStatus(rw http.ResponseWriter, req *http.Request) {
	ctx, cancel := context.WithTimeout(req.Context(), handlerTimeout)
	defer cancel()

	params := new(onboardingtypes.QueryableStatus)
	if err := binding.Query.BindQuery(req.URL.Query(), params); err != nil {
		render.Error(rw, err)
		return
	}

	query, err := onboardingtypes.NewStatusQuery(*params, time.Now().UTC())
	if err != nil {
		render.Error(rw, err)
		return
	}

	status, err := h.module.GetStatus(ctx, query)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, status)
}

func (h *handler) GetIngestion(rw http.ResponseWriter, req *http.Request) {
	ctx, cancel := context.WithTimeout(req.Context(), handlerTimeout)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	ingestion, err := h.module.GetIngestion(ctx, valuer.MustNewUUID(claims.OrgID), req.Host)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, ingestion)
}

func (h *handler) UpdateIngestion(rw http.ResponseWriter, req *http.Request) {
	ctx, cancel := context.WithTimeout(req.Context(), handlerTimeout)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	updatable := new(onboardingtypes.UpdatableIngestion)
	if err := binding.JSON.BindBody(req.Body, updatable); err != nil {
		render.Error(rw, err)
		return
	}

	ingestion, err := h.module.UpdateIngestion(ctx, valuer.MustNewUUID(claims.OrgID), req.Host, updatable)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, ingestion)
}
