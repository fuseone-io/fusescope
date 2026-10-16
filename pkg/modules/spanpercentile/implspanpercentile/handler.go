package implspanpercentile

import (
	"encoding/json"
	"net/http"

	errorsV2 "github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/spanpercentile"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/spanpercentiletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type handler struct {
	module spanpercentile.Module
}

func NewHandler(module spanpercentile.Module) spanpercentile.Handler {
	return &handler{
		module: module,
	}
}

func (h *handler) GetSpanPercentileDetails(w http.ResponseWriter, r *http.Request) {
	claims, err := authtypes.ClaimsFromContext(r.Context())
	if err != nil {
		render.Error(w, err)
		return
	}

	spanPercentileRequest, err := parseSpanPercentileRequestBody(r)
	if err != nil {
		render.Error(w, err)
		return
	}

	result, err := h.module.GetSpanPercentile(r.Context(), valuer.MustNewUUID(claims.OrgID), spanPercentileRequest)
	if err != nil {
		render.Error(w, err)
		return
	}

	render.Success(w, http.StatusOK, result)
}

func parseSpanPercentileRequestBody(r *http.Request) (*spanpercentiletypes.SpanPercentileRequest, error) {
	req := new(spanpercentiletypes.SpanPercentileRequest)
	if err := json.NewDecoder(r.Body).Decode(req); err != nil {
		return nil, errorsV2.Newf(errorsV2.TypeInvalidInput, errorsV2.CodeInvalidInput, "cannot parse the request body: %v", err)
	}

	if err := req.Validate(); err != nil {
		return nil, err
	}

	return req, nil
}
