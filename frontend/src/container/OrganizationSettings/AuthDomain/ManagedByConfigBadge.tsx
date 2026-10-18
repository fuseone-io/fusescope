import { Tooltip } from 'antd';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';

function ManagedByConfigBadge(): JSX.Element {
	return (
		<Tooltip title="Declared in the FuseScope configuration file. Change it there; it is read-only here.">
			<span>
				<StatusBadge tone="info" testId="auth-domain-managed-badge">
					Managed by configuration
				</StatusBadge>
			</span>
		</Tooltip>
	);
}

export default ManagedByConfigBadge;
