import styles from 'container/LogsExplorerChart/FrequencyLegend.module.scss';
import { cleanLegendLabel } from 'container/LogsExplorerChart/FrequencyLegendItems';
import uPlot from 'uplot';

interface HeaderLegendProps {
	/** The chart's uPlot series; index 0 is the x axis. */
	series: uPlot.Series[];
	/** Visibility by uPlot series index; index 0 is the x axis. */
	visibility: boolean[];
	/** Query name of each series after x, to prefix labels on combined charts. */
	queryNames?: string[];
	onSelect: (seriesIndex: number) => void;
}

function seriesColor(series: uPlot.Series): string | undefined {
	return typeof series.stroke === 'string' ? series.stroke : undefined;
}

/** The chart's series as one line of colour squares for a panel header. */
function HeaderLegend({
	series,
	visibility,
	queryNames,
	onSelect,
}: HeaderLegendProps): JSX.Element {
	return (
		<div className={styles.legend} data-testid="time-series-header-legend">
			{series.slice(1).map((item, offset) => {
				const index = offset + 1;
				const name = cleanLegendLabel(String(item.label ?? ''));
				const prefix = queryNames?.[offset];
				const label = prefix ? `${prefix} · ${name}` : name;
				const shown = visibility[index] ?? true;
				return (
					<button
						// Labels can repeat across series; the index is the identity.
						// eslint-disable-next-line react/no-array-index-key
						key={index}
						type="button"
						role="switch"
						aria-checked={shown}
						aria-label={label}
						title={label}
						className={styles.item}
						data-hidden={!shown}
						onClick={(): void => onSelect(index)}
					>
						<span
							aria-hidden="true"
							className={styles.swatch}
							style={{ background: seriesColor(item) }}
						/>
						<span className={styles.label}>{label}</span>
					</button>
				);
			})}
		</div>
	);
}

export default HeaderLegend;
