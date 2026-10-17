import { SuccessResponse } from 'types/api';
import { DeployStatus, Pipeline } from 'types/api/pipeline/def';

export const pipelineRefetchInterval = (
	pipelineResponse: SuccessResponse<Pipeline> | undefined,
): number | false => {
	// Refetch pipeline data periodically if deployment of
	// its latest changes is not complete yet.
	const latestVersion = pipelineResponse?.payload?.history?.[0];
	const isLatestDeploymentFinished =
		latestVersion?.deployStatus === DeployStatus.Deployed ||
		latestVersion?.deployStatus === DeployStatus.Failed;
	if (latestVersion && !isLatestDeploymentFinished) {
		return 3000;
	}
	return false;
};
