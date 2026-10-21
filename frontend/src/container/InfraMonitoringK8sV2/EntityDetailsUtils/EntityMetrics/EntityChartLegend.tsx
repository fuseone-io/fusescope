import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getVisibleSeriesState } from 'lib/uPlotV2/components/Legend/utils';
import { LegendAction } from 'lib/uPlotV2/components/types';
import { UPlotConfigBuilder } from 'lib/uPlotV2/config/UPlotConfigBuilder';
import { useLegendActions } from 'lib/uPlotV2/hooks/useLegendActions';
import useLegendsSync from 'lib/uPlotV2/hooks/useLegendsSync';
import { cn } from 'lib/utils';

interface EntityChartLegendProps {
	config: UPlotConfigBuilder;
	/** The chart panel's header slot; the legend renders there. */
	container: HTMLElement | null;
}

/**
 * The chart's series as swatches in its panel header. Rendered inside the
 * chart (through `layoutChildren`) so it shares the plot context, and portalled
 * to the header. A click isolates a series, or restores all when it is the
 * only one shown; hovering highlights it.
 */
function EntityChartLegend({
	config,
	container,
}: EntityChartLegendProps): JSX.Element | null {
	const { legendItemsMap } = useLegendsSync({ config });
	const onAction = useLegendActions();

	const items = useMemo(() => Object.values(legendItemsMap), [legendItemsMap]);
	const { onlyVisibleSeriesIndex, areAllSeriesVisible } = useMemo(
		() => getVisibleSeriesState(items, ''),
		[items],
	);

	if (!container || items.length === 0) {
		return null;
	}

	return createPortal(
		<ul
			aria-label="Legend"
			data-testid="entity-chart-legend"
			className="tw:m-0 tw:flex tw:min-w-0 tw:list-none tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:p-0 tw:text-xs tw:font-normal tw:text-muted-foreground"
		>
			{items.map((item) => {
				const label = String(item.label ?? '');
				const color = typeof item.color === 'string' ? item.color : undefined;
				return (
					<li key={item.seriesIndex} className="tw:min-w-0">
						<button
							type="button"
							role="switch"
							aria-checked={item.show}
							title={label}
							className={cn(
								'tw:flex tw:max-w-60 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-sm tw:hover:text-foreground',
								!item.show && 'tw:opacity-45',
							)}
							onClick={(): void => {
								if (onlyVisibleSeriesIndex === item.seriesIndex) {
									onAction({ type: LegendAction.SHOW_ALL });
									return;
								}
								onAction({
									type: areAllSeriesVisible
										? LegendAction.SHOW_ONLY
										: LegendAction.TOGGLE,
									seriesIndex: item.seriesIndex,
								});
							}}
							onMouseEnter={(): void =>
								onAction({ type: LegendAction.HOVER, seriesIndex: item.seriesIndex })
							}
							onMouseLeave={(): void =>
								onAction({ type: LegendAction.HOVER, seriesIndex: null })
							}
						>
							<span
								aria-hidden="true"
								className="tw:size-2 tw:flex-none tw:rounded-[2px]"
								style={{ background: color }}
							/>
							<span className="tw:truncate">{label}</span>
						</button>
					</li>
				);
			})}
		</ul>,
		container,
	);
}

export default EntityChartLegend;
