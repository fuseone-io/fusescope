import { Tooltip } from '@signozhq/ui/tooltip';
import cx from 'classnames';

import { acceptedData } from './acceptedData';
import type { PanelTypeItem } from './panelTypeCatalog';

import styles from './PanelTypeBrowser.module.scss';

interface PanelTypeTileProps {
	item: PanelTypeItem;
	isSelected: boolean;
	/** Why the kind can't be picked; the tile is disabled when set. */
	disabledReason?: string;
	onSelect: () => void;
}

function PanelTypeTile({
	item,
	isSelected,
	disabledReason,
	onSelect,
}: PanelTypeTileProps): JSX.Element {
	const { icon: Icon } = item;
	const tile = (
		<button
			type="button"
			className={cx(styles.tile, {
				[styles.tileSelected]: isSelected,
				[styles.tileDisabled]: !!disabledReason,
			})}
			data-testid={`panel-type-${item.kind}`}
			aria-pressed={isSelected}
			// aria-disabled, not disabled, so the reason tooltip still gets hover events.
			aria-disabled={!!disabledReason}
			onClick={disabledReason ? undefined : onSelect}
		>
			<span className={styles.tileIcon} aria-hidden="true">
				<Icon size={20} />
			</span>
			<span className={styles.tileText}>
				<span className={styles.tileTitle}>
					<span className={styles.tileName}>{item.displayName}</span>
					{item.isNew && <span className={styles.newBadge}>New</span>}
				</span>
				<span className={styles.tileDescription}>{item.description}</span>
				<span
					className={styles.tileData}
					aria-label={`Accepts: ${acceptedData(item.kind).join(', ')}`}
					data-testid={`panel-type-data-${item.kind}`}
				>
					{acceptedData(item.kind).map((chip) => (
						<span key={chip} className={styles.dataChip}>
							{chip}
						</span>
					))}
				</span>
			</span>
		</button>
	);

	return disabledReason ? (
		<Tooltip title={disabledReason}>{tile}</Tooltip>
	) : (
		tile
	);
}

export default PanelTypeTile;
