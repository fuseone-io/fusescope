import { getDeploymentStage, getDeploymentStageIcon } from './utils';

function DeploymentStage(deployStatus: string): JSX.Element {
	return (
		<span className="pipeline-deploy-stage" data-stage={deployStatus}>
			{getDeploymentStageIcon(deployStatus)}
			<span className="pipeline-deploy-stage__label">
				{getDeploymentStage(deployStatus)}
			</span>
		</span>
	);
}

export default DeploymentStage;
