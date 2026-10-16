package spanpercentile

import (
	"context"
	"net/http"

	"github.com/fuseone-io/fusescope/pkg/types/spanpercentiletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Module interface {
	GetSpanPercentile(ctx context.Context, orgID valuer.UUID, req *spanpercentiletypes.SpanPercentileRequest) (*spanpercentiletypes.SpanPercentileResponse, error)
}

type Handler interface {
	GetSpanPercentileDetails(http.ResponseWriter, *http.Request)
}
