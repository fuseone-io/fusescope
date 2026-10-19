import { LegendAction, OnLegendAction } from 'lib/uPlotV2/components/types';
import { getVisibleSeriesState } from 'lib/uPlotV2/components/Legend/utils';
import { LegendItem } from 'lib/uPlotV2/config/types';

import styles from './FrequencyLegend.module.scss';

const LABEL_SELECTOR = /^\{[^=]+="(.*)"\}$/;

/** `{severity_text="error"}` reads as `error`; plain labels are trimmed. */
export function cleanLegendLabel(label: string): string {
	const trimmed = label.trim();
	return LABEL_SELECTOR.exec(trimmed)?.[1] ?? trimmed;
}

interface FrequencyLegendItemsProps {
	items: LegendItem[];
	onAction: OnLegendAction;
}

/** A one-line legend of colour squares; a click isolates, as in the chart legend. */
function FrequencyLegendItems({
	items,
	onAction,
}: FrequencyLegendItemsProps): JSX.Element {
	const { onlyVisibleSeriesIndex, areAllSeriesVisible } = getVisibleSeriesState(
		items,
		'',
	);

	const handleClick = (seriesIndex: number): void => {
		if (onlyVisibleSeriesIndex === seriesIndex) {
			onAction({ type: LegendAction.SHOW_ALL });
			return;
		}
		onAction({
			type: areAllSeriesVisible ? LegendAction.SHOW_ONLY : LegendAction.TOGGLE,
			seriesIndex,
		});
	};

	return (
		<div
			className={styles.legend}
			data-testid="logs-frequency-legend"
			onMouseLeave={(): void =>
				onAction({ type: LegendAction.HOVER, seriesIndex: null })
			}
		>
			{items.map((item) => {
				const label = cleanLegendLabel(item.label ?? '');
				return (
					<button
						key={item.seriesIndex}
						type="button"
						role="switch"
						aria-checked={item.show}
						aria-label={label}
						title={label}
						className={styles.item}
						data-hidden={!item.show}
						onClick={(): void => handleClick(item.seriesIndex)}
						onMouseEnter={(): void =>
							onAction({ type: LegendAction.HOVER, seriesIndex: item.seriesIndex })
						}
					>
						<span
							aria-hidden="true"
							className={styles.swatch}
							style={{
								background: typeof item.color === 'string' ? item.color : undefined,
							}}
						/>
						<span className={styles.label}>{label}</span>
					</button>
				);
			})}
		</div>
	);
}

export default FrequencyLegendItems;
