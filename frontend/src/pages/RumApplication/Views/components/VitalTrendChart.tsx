import { useState } from 'react';
import dayjs from 'dayjs';
import { VitalName } from 'lib/rum/types';
import { formatVital, VITAL_THRESHOLDS } from 'lib/rum/vitals';

import { ReleaseMarker, VitalPoint } from '../types';
import { chartMax } from '../utils';

interface VitalTrendChartProps {
	vital: VitalName;
	points: VitalPoint[];
	releases: ReleaseMarker[];
	/** Epoch ms of the x-axis ends. */
	start: number;
	end: number;
}

const TICKS = 4;
const X_LABELS = 5;

/** A vital's p75 over time with its thresholds and release markers. */
function VitalTrendChart({
	vital,
	points,
	releases,
	start,
	end,
}: VitalTrendChartProps): JSX.Element {
	const [hover, setHover] = useState<VitalPoint | null>(null);
	const max = chartMax(points, vital);
	const span = Math.max(end - start, 1);
	const x = (at: number): number => ((at - start) * 100) / span;
	const y = (value: number): number => 100 - (Math.min(value, max) * 100) / max;
	const [good, poor] = VITAL_THRESHOLDS[vital];
	const path = points
		.map((point, index) => `${index ? 'L' : 'M'}${x(point.at)} ${y(point.p75)}`)
		.join(' ');
	const timeFormat = span > 2 * 86_400_000 ? 'MMM D' : 'HH:mm';

	const onMove = (event: React.MouseEvent<HTMLDivElement>): void => {
		const box = event.currentTarget.getBoundingClientRect();
		const at = start + ((event.clientX - box.left) / box.width) * span;
		const nearest = points.reduce<VitalPoint | null>(
			(best, point) =>
				!best || Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best,
			null,
		);
		setHover(nearest);
	};

	return (
		<div className="tw:grid tw:grid-cols-[52px_minmax(0,1fr)] tw:gap-x-2 tw:gap-y-1">
			<div className="tw:relative tw:h-40 tw:text-[11px] tw:text-subtle-foreground tw:tabular-nums">
				{Array.from({ length: TICKS }, (_, index) => {
					const value = (max * (TICKS - 1 - index)) / (TICKS - 1);
					return (
						<span
							key={value}
							className="tw:absolute tw:right-0 tw:-translate-y-1/2"
							style={{ top: `${y(value)}%` }}
						>
							{value === 0 ? '0' : formatVital(vital, value)}
						</span>
					);
				})}
			</div>
			<div
				role="img"
				aria-label={`${vital.toUpperCase()} p75 over time, ${points.length} points`}
				data-testid="rum-route-chart"
				onMouseMove={onMove}
				onMouseLeave={(): void => setHover(null)}
				className="tw:relative tw:h-40 tw:border-b tw:border-l tw:border-border"
			>
				<svg
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
					className="tw:absolute tw:inset-0 tw:size-full tw:overflow-visible"
				>
					{[good, poor].map((threshold) => (
						<line
							key={threshold}
							x1={0}
							x2={100}
							y1={y(threshold)}
							y2={y(threshold)}
							strokeDasharray="4 4"
							vectorEffect="non-scaling-stroke"
							className={threshold === good ? 'tw:stroke-success' : 'tw:stroke-error'}
						/>
					))}
					{releases.map((marker) => (
						<line
							key={marker.release}
							x1={x(marker.at)}
							x2={x(marker.at)}
							y1={0}
							y2={100}
							strokeDasharray="2 3"
							vectorEffect="non-scaling-stroke"
							className="tw:stroke-muted-foreground"
						/>
					))}
					<path
						d={path}
						fill="none"
						strokeWidth={2}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
						className="tw:stroke-primary"
					/>
				</svg>
				{releases.map((marker) => (
					<span
						key={marker.release}
						data-testid="rum-route-release-marker"
						className="tw:absolute tw:top-0 tw:ml-1 tw:font-mono tw:text-[10px] tw:whitespace-nowrap tw:text-muted-foreground"
						style={{ left: `${x(marker.at)}%` }}
					>
						{marker.release}
					</span>
				))}
				{points.map((point) => (
					<span
						key={point.at}
						aria-hidden="true"
						className="tw:absolute tw:size-1.5 tw:-translate-1/2 tw:rounded-full tw:bg-primary"
						style={{ left: `${x(point.at)}%`, top: `${y(point.p75)}%` }}
					/>
				))}
				{hover && (
					<>
						<span
							aria-hidden="true"
							className="tw:pointer-events-none tw:absolute tw:inset-y-0 tw:w-px tw:bg-border"
							style={{ left: `${x(hover.at)}%` }}
						/>
						<span
							className="tw:pointer-events-none tw:absolute tw:z-10 tw:-translate-x-1/2 tw:-translate-y-[calc(100%+8px)] tw:rounded-md tw:border tw:border-border tw:bg-popover tw:px-2 tw:py-1 tw:text-xs tw:whitespace-nowrap tw:shadow-md"
							style={{ left: `${x(hover.at)}%`, top: `${y(hover.p75)}%` }}
						>
							<span className="tw:text-muted-foreground">
								{dayjs(hover.at).format('MMM D, HH:mm')}
							</span>{' '}
							<span className="tw:font-medium tw:tabular-nums">
								{formatVital(vital, hover.p75)}
							</span>
						</span>
					</>
				)}
				{points.length === 0 && (
					<span className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:text-xs tw:text-subtle-foreground">
						No samples in this range
					</span>
				)}
			</div>
			<span />
			<div className="tw:flex tw:justify-between tw:text-[11px] tw:text-subtle-foreground tw:tabular-nums">
				{Array.from({ length: X_LABELS }, (_, index) => {
					const at = start + (span * index) / (X_LABELS - 1);
					return <span key={at}>{dayjs(at).format(timeFormat)}</span>;
				})}
			</div>
		</div>
	);
}

export default VitalTrendChart;
