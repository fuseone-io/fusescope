import DeltaText from 'components/PageTemplate/components/DeltaText';
import Sparkline from 'components/PageTemplate/components/Sparkline';
import { cn } from 'lib/utils';

import { KpiTile } from '../../types';

interface KpiTilesProps {
	tiles: KpiTile[];
}

/** Two-by-two tiles: value, change against the previous period, trend. */
function KpiTiles({ tiles }: KpiTilesProps): JSX.Element {
	return (
		<div
			data-testid="service-map-node-kpis"
			className="tw:grid tw:grid-cols-2 tw:gap-2 tw:px-4 tw:pb-3.5"
		>
			{tiles.map((tile) => (
				<div
					key={tile.label}
					className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:px-2.5 tw:py-2"
				>
					<span className="tw:flex tw:items-baseline tw:justify-between tw:gap-1.5">
						<span className="tw:text-[11px] tw:text-muted-foreground">
							{tile.label}
						</span>
						{tile.delta && (
							<DeltaText
								text={tile.delta.text}
								tone={tile.delta.tone}
								className="tw:text-[11px]"
							/>
						)}
					</span>
					<span
						className={cn(
							'tw:text-base tw:font-semibold tw:whitespace-nowrap tw:tabular-nums',
							tile.valueClassName,
						)}
					>
						{tile.value}
					</span>
					{tile.spark && (
						<Sparkline
							values={tile.spark}
							strokeClassName={tile.sparkClassName}
							className="tw:h-6 tw:w-full"
						/>
					)}
				</div>
			))}
		</div>
	);
}

export default KpiTiles;
