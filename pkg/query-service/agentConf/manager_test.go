package agentConf

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/opamptypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type fakeFeature struct {
	featureType AgentFeatureType
	settings    string
}

func (f *fakeFeature) AgentFeatureType() AgentFeatureType { return f.featureType }
func (f *fakeFeature) RecommendAgentConfig(_ valuer.UUID, conf []byte, _ *opamptypes.AgentConfigVersion) ([]byte, string, error) {
	return append(conf, []byte(string(f.featureType)+"\n")...), f.settings, nil
}

func TestRecommendAgentConfig(t *testing.T) {
	ctx := context.Background()
	store := newVersionStore(t, "sqlite")
	orgID := valuer.GenerateUUID()
	row := opamptypes.NewAgentConfigVersion(orgID, valuer.GenerateUUID(), opamptypes.ElementTypeLogPipelines)
	row.Version = 3
	_, err := store.BunDB().NewInsert().Model(row).Exec(ctx)
	require.NoError(t, err)

	spanMapper := &fakeFeature{featureType: "span_attr_mapping", settings: `[{"group":"a"}]`}
	manager, err := Initiate(&ManagerOptions{Store: store, AgentFeatures: []AgentFeature{
		&fakeFeature{featureType: "log_pipelines", settings: `{"pipelines":[]}`},
		spanMapper,
	}})
	require.NoError(t, err)

	recommendation, err := manager.RecommendAgentConfig(orgID, []byte("base\n"))
	require.NoError(t, err)

	digest := sha256.Sum256([]byte(spanMapper.settings))
	t.Run("ID", func(t *testing.T) {
		// Versioned features keep `<type>:<version>` as it has always been
		// formatted, which stored hashes and agents' reports carry; the
		// others carry the digest of their settings (#261).
		assert.Equal(t, "{log_pipelines}:3,span_attr_mapping:"+hex.EncodeToString(digest[:]), recommendation.ID)
		assert.Equal(t, "base\nlog_pipelines\nspan_attr_mapping\n", string(recommendation.Config))
	})

	t.Run("NoSideEffect", func(t *testing.T) {
		latest, err := manager.GetLatestVersion(ctx, orgID, opamptypes.ElementTypeLogPipelines)
		require.NoError(t, err)
		assert.Equal(t, opamptypes.PendingDeploy, latest.DeployStatus, "a recommendation alone starts no deployment")
	})

	t.Run("Deterministic", func(t *testing.T) {
		again, err := manager.RecommendAgentConfig(orgID, []byte("base\n"))
		require.NoError(t, err)
		assert.Equal(t, recommendation.ID, again.ID)

		spanMapper.settings = `[{"group":"b"}]`
		changed, err := manager.RecommendAgentConfig(orgID, []byte("base\n"))
		require.NoError(t, err)
		assert.NotEqual(t, recommendation.ID, changed.ID, "a settings change changes the ID")
		spanMapper.settings = `[{"group":"a"}]`
	})

	t.Run("Initiated", func(t *testing.T) {
		manager.ReportConfigDeploymentInitiated(orgID, recommendation)
		latest, err := manager.GetLatestVersion(ctx, orgID, opamptypes.ElementTypeLogPipelines)
		require.NoError(t, err)
		assert.Equal(t, opamptypes.DeployInitiated, latest.DeployStatus)
		status, err := manager.GetDeployStatusByHash(ctx, orgID, orgID.String()+recommendation.Features[0].ID)
		require.NoError(t, err)
		assert.Equal(t, opamptypes.DeployInitiated, status, "the ack finds the version by its part of the ID")
	})
}
