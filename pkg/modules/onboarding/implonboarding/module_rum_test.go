package implonboarding

import (
	"context"
	"net/url"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRUMOverrideLifecycle(t *testing.T) {
	module, _ := newTestModule(t, global.Config{RUMIngestionURL: &url.URL{Scheme: "https", Host: "rum.config.io"}}, "")
	ctx := context.Background()
	orgID := valuer.GenerateUUID()
	rumURL := "https://mobile.acme.io/rum/v1/"
	ingestion, err := module.UpdateIngestion(ctx, orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "https://otlp.acme.io", RUMURL: &rumURL})
	require.NoError(t, err)
	assert.Equal(t, "https://mobile.acme.io", ingestion.RUMEndpoint)
	assert.Equal(t, onboardingtypes.IngestionSourceOrganization, ingestion.RUMSource)
	assert.Equal(t, "https://otlp.acme.io", ingestion.OTLPHTTPEndpoint)

	ingestion, err = module.UpdateIngestion(ctx, orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "https://other-otlp.acme.io"})
	require.NoError(t, err)
	assert.Equal(t, "https://mobile.acme.io", ingestion.RUMEndpoint)

	rumURL = "https://user:secret@invalid.acme.io"
	_, err = module.UpdateIngestion(ctx, orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "https://must-not-persist.acme.io", RUMURL: &rumURL})
	require.Error(t, err)
	ingestion, err = module.GetIngestion(ctx, orgID, "")
	require.NoError(t, err)
	assert.Equal(t, "https://other-otlp.acme.io", ingestion.OTLPHTTPEndpoint)

	ingestion, err = module.GetIngestion(ctx, valuer.GenerateUUID(), "")
	require.NoError(t, err)
	assert.Equal(t, "https://rum.config.io", ingestion.RUMEndpoint)

	rumURL = ""
	ingestion, err = module.UpdateIngestion(ctx, orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "https://last-otlp.acme.io", RUMURL: &rumURL})
	require.NoError(t, err)
	assert.Equal(t, "https://rum.config.io", ingestion.RUMEndpoint)
	assert.Equal(t, onboardingtypes.IngestionSourceConfig, ingestion.RUMSource)
}
