import {
	CircleAlert,
	CircleCheck,
	CircleMinus,
	CircleX,
	LoaderCircle,
} from 'lucide-react';

export function getDeploymentStage(value: string): string {
	switch (value) {
		case 'in_progress':
			return 'In Progress';
		case 'deployed':
			return 'Deployed';
		case 'dirty':
			return 'Dirty';
		case 'failed':
			return 'Failed';
		case 'unknown':
			return 'Unknown';
		default:
			return '';
	}
}

export function getDeploymentStageIcon(value: string): JSX.Element {
	switch (value) {
		case 'in_progress':
			return (
				<LoaderCircle
					data-testid="deployment-icon-in-progress"
					className="animate-spin"
				/>
			);
		case 'deployed':
			return <CircleCheck data-testid="deployment-icon-deployed" />;
		case 'dirty':
			return <CircleAlert data-testid="deployment-icon-dirty" />;
		case 'failed':
			return <CircleX data-testid="deployment-icon-failed" />;
		case 'unknown':
			return <CircleMinus data-testid="deployment-icon-unknown" />;
		default:
			return <span />;
	}
}
