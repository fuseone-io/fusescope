import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';

import { ConnectionStates, ConnectionStatesLabelMap } from './TestConnection';

const CONNECTION_TONES: Record<ConnectionStates, StatusTone> = {
	[ConnectionStates.Connected]: 'success',
	[ConnectionStates.TestingConnection]: 'warning',
	[ConnectionStates.NoDataSinceLong]: 'info',
	[ConnectionStates.NotInstalled]: 'neutral',
};

interface ConnectionStatusBadgeProps {
	connectionState: ConnectionStates;
}

function ConnectionStatusBadge({
	connectionState,
}: ConnectionStatusBadgeProps): JSX.Element {
	return (
		<StatusBadge
			dot
			tone={CONNECTION_TONES[connectionState]}
			testId="integration-connection-status"
		>
			{ConnectionStatesLabelMap[connectionState]}
		</StatusBadge>
	);
}

export default ConnectionStatusBadge;
