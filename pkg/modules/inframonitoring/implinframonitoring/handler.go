package implinframonitoring

import (
	"net/http"

	"github.com/fuseone-io/fusescope/pkg/http/binding"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/inframonitoring"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/inframonitoringtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type handler struct {
	module inframonitoring.Module
}

// NewHandler returns an inframonitoring.Handler implementation.
func NewHandler(m inframonitoring.Module) inframonitoring.Handler {
	return &handler{
		module: m,
	}
}

func (h *handler) GetChecks(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableChecks
	if err := binding.Query.BindQuery(req.URL.Query(), &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.GetChecks(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListHosts(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableHosts
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListHosts(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListPods(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostablePods
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListPods(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListContainers(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableContainers
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListContainers(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListNodes(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableNodes
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListNodes(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListNamespaces(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableNamespaces
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListNamespaces(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListClusters(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableClusters
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListClusters(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListVolumes(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableVolumes
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListVolumes(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListDeployments(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableDeployments
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListDeployments(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListStatefulSets(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableStatefulSets
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListStatefulSets(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListJobs(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableJobs
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListJobs(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}

func (h *handler) ListDaemonSets(rw http.ResponseWriter, req *http.Request) {
	claims, err := authtypes.ClaimsFromContext(req.Context())
	if err != nil {
		render.Error(rw, err)
		return
	}

	orgID := valuer.MustNewUUID(claims.OrgID)

	var parsedReq inframonitoringtypes.PostableDaemonSets
	if err := binding.JSON.BindBody(req.Body, &parsedReq); err != nil {
		render.Error(rw, err)
		return
	}

	result, err := h.module.ListDaemonSets(req.Context(), orgID, &parsedReq)
	if err != nil {
		render.Error(rw, err)
		return
	}

	render.Success(rw, http.StatusOK, result)
}
