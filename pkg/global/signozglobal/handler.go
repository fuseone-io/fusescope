package signozglobal

import (
	"context"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/http/render"
)

type handler struct {
	global global.Global
}

func NewHandler(global global.Global) global.Handler {
	return &handler{global: global}
}

func (handler *handler) GetConfig(rw http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	cfg := handler.global.GetConfig(ctx)

	render.Success(rw, http.StatusOK, cfg)
}
