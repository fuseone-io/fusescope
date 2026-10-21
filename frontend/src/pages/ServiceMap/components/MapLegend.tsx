import { cn } from 'lib/utils';

import { RING_CLASS } from '../constants';
import { ColorMode } from '../types';

interface MapLegendProps {
	colorMode: ColorMode;
}

const ITEMS: Record<ColorMode, { tone: string; label: string }[]> = {
	health: [
		{ tone: 'success', label: 'Healthy' },
		{ tone: 'warning', label: 'Degraded · errors ≥ 1% or p99 ≥ 800 ms' },
		{ tone: 'error', label: 'Critical · errors ≥ 5% or p99 ≥ 2 s' },
	],
	latency: [
		{ tone: 'success', label: 'p99 < 500 ms' },
		{ tone: 'warning', label: 'p99 500 ms – 2 s' },
		{ tone: 'error', label: 'p99 ≥ 2 s' },
	],
	throughput: [{ tone: 'primary', label: 'Node size = requests/s' }],
};

const RING = 'tw:inline-block tw:size-3 tw:flex-none tw:border-2';

function MapLegend({ colorMode }: MapLegendProps): JSX.Element {
	return (
		<div
			data-testid="service-map-legend"
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-1.5 tw:border-t tw:border-border tw:px-4 tw:py-2.5 tw:font-sans tw:text-[11px] tw:text-muted-foreground"
		>
			{ITEMS[colorMode].map((item) => (
				<span key={item.label} className="tw:flex tw:items-center tw:gap-2">
					<span className={cn(RING, 'tw:rounded-full', RING_CLASS[item.tone])} />
					{item.label}
				</span>
			))}
			<span className="tw:flex tw:items-center tw:gap-2 tw:border-l tw:border-border tw:pl-4">
				<svg aria-hidden="true" width="22" height="8" viewBox="0 0 22 8">
					<line
						x1="1"
						y1="2"
						x2="21"
						y2="2"
						strokeWidth="1"
						className="tw:stroke-ink-subtle"
					/>
					<line
						x1="1"
						y1="6"
						x2="21"
						y2="6"
						strokeWidth="3"
						className="tw:stroke-ink-subtle"
					/>
				</svg>
				Line width = requests/s
			</span>
			<span className="tw:flex tw:items-center tw:gap-2">
				<svg aria-hidden="true" width="22" height="8" viewBox="0 0 22 8">
					<line
						x1="1"
						y1="4"
						x2="21"
						y2="4"
						strokeWidth="2"
						className="tw:stroke-error"
					/>
				</svg>
				Calls with errors ≥ 5%
			</span>
			<span className="tw:flex tw:items-center tw:gap-2">
				<span className={cn(RING, 'tw:rounded-full tw:border-ink-subtle')} />
				Service (OTel SDK)
			</span>
			<span className="tw:flex tw:items-center tw:gap-2">
				<span
					className={cn(
						RING,
						'tw:rounded-[3px] tw:border-dashed tw:border-ink-subtle',
					)}
				/>
				Inferred from client spans
			</span>
		</div>
	);
}

export default MapLegend;
