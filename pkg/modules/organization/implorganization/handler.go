package implorganization

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type handler struct {
	orgGetter organization.Getter
	orgSetter organization.Setter
}

func NewHandler(orgGetter organization.Getter, orgSetter organization.Setter) organization.Handler {
	return &handler{orgGetter: orgGetter, orgSetter: orgSetter}
}

func (handler *handler) Get(rw http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID, err := valuer.NewUUID(claims.OrgID)
	if err != nil {
		render.Error(rw, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "orgId is invalid"))
		return
	}

	organization, err := handler.orgGetter.Get(ctx, orgID)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, organization)
}

func (handler *handler) Update(rw http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	claims, err := authtypes.ClaimsFromContext(ctx)
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID, err := valuer.NewUUID(claims.OrgID)
	if err != nil {
		render.Error(rw, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid org id"))
		return
	}

	var req *types.Organization
	err = json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		render.Error(rw, err)
		return
	}

	req.ID = orgID
	err = handler.orgSetter.Update(ctx, req)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusNoContent, nil)
}
