package middleware

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/auditor/logauditor"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/http/handler"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditAnonymousPublicAccess(t *testing.T) {
	testCases := []struct {
		name   string
		status int
	}{
		{name: "Success", status: http.StatusOK},
		{name: "NotFound", status: http.StatusNotFound},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var output bytes.Buffer
			settings := factorytest.NewSettings()
			settings.Logger = slog.New(slog.NewJSONHandler(&output, nil))
			a, err := logauditor.New(context.Background(), settings, auditor.Config{BufferSize: 10, BatchSize: 10, FlushInterval: time.Hour})
			require.NoError(t, err)
			done := make(chan error, 1)
			go func() { done <- a.Start(context.Background()) }()
			<-a.Healthy()
			orgID := valuer.GenerateUUID()
			router := mux.NewRouter()
			router.Use(NewResource(settings.Logger).Wrap)
			router.Use(NewAudit(settings.Logger, nil, a).Wrap)
			router.Handle("/api/v2/public/dashboards/{id}", handler.New(func(w http.ResponseWriter, r *http.Request) {
				claims := r.Context().Value(anonymousAuditClaimsKey{}).(*authtypes.Claims)
				*claims = authtypes.Claims{OrgID: orgID.StringValue(), Principal: authtypes.Principal{String: valuer.NewString("anonymous")}, IdentNProvider: authtypes.IdentNProviderAnonymous}
				w.WriteHeader(testCase.status)
			}, handler.OpenAPIDef{}, handler.WithResourceDefs(handler.BasicResourceDef{Resource: coretypes.ResourceMetaResourcePublicDashboard, Verb: coretypes.VerbRead, Category: coretypes.ActionCategoryDataAccess, ID: coretypes.PathParam("id"), Selector: coretypes.IDSelector})))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v2/public/dashboards/private-link-value", nil))
			require.NoError(t, a.Stop(context.Background()))
			require.NoError(t, <-done)
			assert.Equal(t, testCase.status, response.Code)
			assert.Contains(t, output.String(), orgID.StringValue())
			assert.Contains(t, output.String(), `"signoz.audit.principal.type":"anonymous"`)
			assert.Contains(t, output.String(), "public-dashboard.read")
			assert.NotContains(t, output.String(), "private-link-value")
		})
	}
}
