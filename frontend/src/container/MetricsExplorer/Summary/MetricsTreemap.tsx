import { useMemo, useState } from 'react';
import { MetricsexplorertypesTreemapModeDTO } from 'api/generated/services/fuseScope.schemas';
import ErrorInPlace from 'components/ErrorInPlace/ErrorInPlace';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { TREEMAP_HEIGHT, TREEMAP_VIEW_OPTIONS } from './constants';
import { layoutTreemap } from './treemapLayout';
import { MetricsTreemapInternalProps, MetricsTreemapProps } from './types';

// Layout in a fixed box, placed in percentages so the map follows the panel width.
const LAYOUT_WIDTH = 1000;
const LABEL_MIN_WIDTH = 110;
const LABEL_MIN_HEIGHT = 40;
const SERIES_TOKENS = 7;

/** A light tint of the next series colour, so neighbouring tiles differ. */
function tileBackground(index: number): string {
	const token = `var(--fs-series-${(index % SERIES_TOKENS) + 1})`;
	return `color-mix(in srgb, ${token} 24%, var(--fs-card))`;
}

function MetricsTreemapInternal({
	isLoading,
	isError,
	error,
	data,
	viewType,
	openMetricDetails,
}: MetricsTreemapInternalProps): JSX.Element {
	const tiles = useMemo(() => {
		const entries =
			(viewType === MetricsexplorertypesTreemapModeDTO.timeseries
				? data?.timeseries
				: data?.samples) || [];
		const percentages = new Map(
			entries.map((entry) => [entry.metricName, entry.percentage]),
		);
		return layoutTreemap(
			entries.map((entry) => ({ id: entry.metricName, value: entry.percentage })),
			{ width: LAYOUT_WIDTH, height: TREEMAP_HEIGHT },
		).map((tile) => ({
			...tile,
			percentage: Number(percentages.get(tile.id) ?? 0).toFixed(2),
		}));
	}, [data, viewType]);

	if (isLoading) {
		return (
			<div data-testid="metrics-treemap-loading-state" className="fs-ui">
				<Skeleton className="tw:w-full" style={{ height: TREEMAP_HEIGHT }} />
			</div>
		);
	}

	if (isError && error) {
		return <ErrorInPlace error={error} />;
	}

	if (isError || !tiles.length) {
		return (
			<div
				data-testid={
					isError ? 'metrics-treemap-error-state' : 'metrics-treemap-empty-state'
				}
				className="fs-ui tw:flex tw:items-center tw:justify-center tw:font-sans tw:text-[13px] tw:text-muted-foreground"
				style={{ height: TREEMAP_HEIGHT }}
			>
				{isError
					? 'Error fetching metrics. If the problem persists, please contact support.'
					: 'No metrics found'}
			</div>
		);
	}

	const modeLabel =
		viewType === MetricsexplorertypesTreemapModeDTO.timeseries
			? 'time series'
			: 'samples';

	return (
		<div
			className="fs-ui tw:relative tw:font-sans"
			style={{ height: TREEMAP_HEIGHT }}
			data-testid="metrics-treemap"
		>
			{tiles.map((tile, index) => {
				const showLabel =
					tile.width >= LABEL_MIN_WIDTH && tile.height >= LABEL_MIN_HEIGHT;
				const label = `${tile.id}, ${tile.percentage}% of ${modeLabel}`;
				return (
					<button
						key={tile.id}
						type="button"
						aria-label={label}
						title={`${tile.id}: ${tile.percentage}%`}
						data-testid={`metrics-treemap-tile-${tile.id}`}
						onClick={(event): void => openMetricDetails(tile.id, 'treemap', event)}
						className="tw:absolute tw:flex tw:cursor-pointer tw:flex-col tw:justify-between tw:gap-0.5 tw:overflow-hidden tw:rounded-md tw:border-2 tw:border-surface-raised tw:px-2 tw:py-1.5 tw:text-left tw:text-xs tw:leading-[1.3] tw:text-foreground tw:transition-[filter] tw:outline-none tw:hover:brightness-90 tw:dark:hover:brightness-125 tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
						style={{
							background: tileBackground(index),
							left: `${(tile.x / LAYOUT_WIDTH) * 100}%`,
							top: `${(tile.y / TREEMAP_HEIGHT) * 100}%`,
							width: `${(tile.width / LAYOUT_WIDTH) * 100}%`,
							height: `${(tile.height / TREEMAP_HEIGHT) * 100}%`,
						}}
					>
						<span
							className={
								showLabel
									? 'tw:w-full tw:truncate tw:font-mono tw:font-medium'
									: 'tw:sr-only'
							}
						>
							{tile.id}
						</span>
						<span
							className={showLabel ? 'tw:tabular-nums tw:opacity-85' : 'tw:sr-only'}
						>
							{`${tile.percentage}%`}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function MetricsTreemap({
	viewType,
	data,
	isLoading,
	isError,
	error,
	openMetricDetails,
	setHeatmapView,
}: MetricsTreemapProps): JSX.Element {
	const [isOpen, setIsOpen] = useState(true);
	const modeLabel =
		viewType === MetricsexplorertypesTreemapModeDTO.timeseries
			? 'time series'
			: 'samples';

	return (
		<section
			aria-label="Proportion view"
			className="metrics-treemap-container tw:flex tw:min-w-0 tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
			data-testid="metrics-treemap-container"
		>
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:px-5 tw:py-3 tw:font-sans">
				<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Toggle proportion view"
						aria-expanded={isOpen}
						aria-controls="metrics-treemap"
						className="tw:size-7 tw:text-muted-foreground"
						onClick={(): void => setIsOpen((open) => !open)}
					>
						{isOpen ? <ChevronDown /> : <ChevronRight />}
					</Button>
					<div className="tw:min-w-0">
						<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">
							Proportion view
						</h2>
						<p className="tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
							{`Top 100 metrics by share of ${modeLabel} in the selected time range. Click a tile for details.`}
						</p>
					</div>
				</div>
				<SegmentedControl
					label="Size tiles by"
					value={viewType}
					disabled={isLoading}
					onChange={setHeatmapView}
					options={[...TREEMAP_VIEW_OPTIONS].reverse()}
				/>
			</div>
			{isOpen && (
				<div id="metrics-treemap" className="tw:mx-[18px] tw:mb-[18px]">
					<MetricsTreemapInternal
						isLoading={isLoading}
						isError={isError}
						error={error}
						data={data}
						viewType={viewType}
						openMetricDetails={openMetricDetails}
					/>
				</div>
			)}
		</section>
	);
}

export default MetricsTreemap;
