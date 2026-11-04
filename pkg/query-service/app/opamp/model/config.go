package model

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/types/opamptypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Interface for source of otel collector config recommendations.
type AgentConfigProvider interface {
	// Generate recommended config for an agent based on its `currentConfYaml`
	// and current state of user facing settings for agent based features.
	// It has no side effect: nothing is recorded until
	// ReportConfigDeploymentInitiated.
	RecommendAgentConfig(orgId valuer.UUID, currentConfYaml []byte) (*opamptypes.ConfigRecommendation, error)

	// Record that a recommendation was pushed to an agent; called only
	// after the push succeeded.
	ReportConfigDeploymentInitiated(orgId valuer.UUID, recommendation *opamptypes.ConfigRecommendation)

	// Report the deployment status an agent sends for a pushed recommendation
	ReportConfigDeploymentStatus(
		orgId valuer.UUID,
		agentId string,
		configId string,
		err error,
	)

	// GetDeployStatusByHash returns the DeployStatus for the given config hash
	// (with orgId prefix as stored in the DB). Returns DeployStatusUnknown when
	// no matching row exists. Used by the agent's first-connect handler to
	// determine whether the reported RemoteConfigStatus resolves a pending deployment.
	GetDeployStatusByHash(ctx context.Context, orgId valuer.UUID, configHash string) (opamptypes.DeployStatus, error)
}
