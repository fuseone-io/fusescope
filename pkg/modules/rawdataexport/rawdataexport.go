package rawdataexport

import (
	"context"
	"net/http"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Module interface {
	ExportRawData(ctx context.Context, orgID valuer.UUID, rangeRequest *qbtypes.QueryRangeRequest, doneChan chan any) (chan *qbtypes.RawRow, chan error)
}

type Handler interface {
	ExportRawData(http.ResponseWriter, *http.Request)
}
