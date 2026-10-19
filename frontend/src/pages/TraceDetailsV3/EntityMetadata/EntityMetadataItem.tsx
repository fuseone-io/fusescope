import { ReactNode } from 'react';
import { Tooltip } from '@signozhq/ui/tooltip';

import styles from './EntityMetadataItem.module.scss';

interface EntityMetadataItemProps {
	tooltip: string;
	label?: string;
	children: ReactNode;
}

function EntityMetadataItem({
	tooltip,
	label,
	children,
}: EntityMetadataItemProps): JSX.Element {
	return (
		<Tooltip title={tooltip}>
			<span className={styles.item}>
				{label && <span className={styles.label}>{label}</span>}
				{children}
			</span>
		</Tooltip>
	);
}

EntityMetadataItem.defaultProps = {
	label: undefined,
};

export default EntityMetadataItem;
