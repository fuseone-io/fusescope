import StatusBadge from 'components/PageTemplate/components/StatusBadge';

import { IntegrationUpdate } from '../utils';

interface UpdateAvailableBadgeProps {
	update: IntegrationUpdate;
}

function UpdateAvailableBadge({
	update,
}: UpdateAvailableBadgeProps): JSX.Element {
	return (
		<StatusBadge tone="info" testId="integration-update-available">
			Update available · v{update.from} → v{update.to}
		</StatusBadge>
	);
}

export default UpdateAvailableBadge;
