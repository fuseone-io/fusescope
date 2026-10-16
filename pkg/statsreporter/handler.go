package statsreporter

import (
	"context"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Handler interface {
	Get(http.ResponseWriter, *http.Request)
}

type handler struct {
	aggregator Aggregator
}

func NewHandler(aggregator Aggregator) Handler {
	return &handler{
		aggregator: aggregator,
	}
}

func (handler *handler) Get(rw http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	stats, err := handler.aggregator.Aggregate(ctx, orgID)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, stats)
}
