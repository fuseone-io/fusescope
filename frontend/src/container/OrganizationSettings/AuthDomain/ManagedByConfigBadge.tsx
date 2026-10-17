import { Tooltip } from 'antd';

import styles from './ManagedByConfigBadge.module.scss';

function ManagedByConfigBadge(): JSX.Element {
	return (
		<Tooltip title="Declared in the FuseScope configuration file. Change it there; it is read-only here.">
			<span className={styles.badge} data-testid="auth-domain-managed-badge">
				Managed by configuration
			</span>
		</Tooltip>
	);
}

export default ManagedByConfigBadge;
