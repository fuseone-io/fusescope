import { Group, Info } from '@signozhq/icons';
import { Tooltip } from '@signozhq/ui/tooltip';

import styles from './EntityGroupHeader.module.scss';
import { signozDocsUrl } from 'constants/docs';

interface EntityGroupHeaderProps {
	title: string;
	icon?: React.ReactNode;
	docPath?: string;
	tooltip?: string;
}

function EntityGroupHeader({
	title,
	icon,
	docPath,
	tooltip,
}: EntityGroupHeaderProps): JSX.Element {
	const renderInfoIcon = (): React.ReactNode => {
		if (docPath) {
			const tooltipTitle = tooltip || 'Not sure what this means?';
			return (
				<Tooltip
					title={
						<>
							{tooltipTitle}{' '}
							<a
								href={signozDocsUrl(docPath)}
								target="_blank"
								rel="noopener"
								onClick={(e): void => e.stopPropagation()}
							>
								Learn more.
							</a>
						</>
					}
				>
					<span className={styles.infoIcon}>
						<Info size="md" />
					</span>
				</Tooltip>
			);
		}

		if (tooltip) {
			return (
				<Tooltip title={tooltip}>
					<span className={styles.infoIcon}>
						<Info size="md" />
					</span>
				</Tooltip>
			);
		}

		return null;
	};

	return (
		<div className={styles.entityGroupHeader} data-slot="entity-group-header">
			<span data-slot="icon">
				{icon || <Group size={14} data-hide-expanded="true" />}
			</span>{' '}
			{title}
			{renderInfoIcon()}
		</div>
	);
}

export default EntityGroupHeader;
