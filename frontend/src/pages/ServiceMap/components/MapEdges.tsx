import { cn } from 'lib/utils';

import { STROKE_CLASS } from '../constants';
import { DrawnEdge } from '../utils/scene';

interface MapEdgesProps {
	edges: DrawnEdge[];
	width: number;
	height: number;
	animate: boolean;
}

/** Calls as curves: width by requests/s, red or amber when they fail. */
function MapEdges({
	edges,
	width,
	height,
	animate,
}: MapEdgesProps): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			width={width}
			height={height}
			className="tw:pointer-events-none tw:absolute tw:top-0 tw:left-0 tw:overflow-visible"
		>
			{edges.map((edge) => (
				<g key={edge.key} data-testid="service-map-edge" data-edge={edge.key}>
					<path
						d={edge.d}
						fill="none"
						strokeWidth={edge.width}
						strokeLinecap="round"
						opacity={edge.opacity}
						className={cn(
							'tw:transition-opacity',
							STROKE_CLASS[edge.tone === 'neutral' && edge.hot ? 'focus' : edge.tone],
						)}
					/>
					{edge.hot && (
						<path
							d={edge.d}
							fill="none"
							strokeWidth={Math.max(1.5, edge.width * 0.6)}
							strokeLinecap="round"
							strokeDasharray="1.5 10"
							className={
								edge.tone === 'error' ? 'tw:stroke-error' : 'tw:stroke-primary'
							}
						>
							{animate && (
								<animate
									attributeName="stroke-dashoffset"
									from="0"
									to="-23"
									dur={`${edge.flowSeconds}s`}
									repeatCount="indefinite"
								/>
							)}
						</path>
					)}
				</g>
			))}
		</svg>
	);
}

export default MapEdges;
