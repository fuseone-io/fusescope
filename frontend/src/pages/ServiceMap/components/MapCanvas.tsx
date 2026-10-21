import { useEffect, useMemo, useRef } from 'react';
import { cn } from 'lib/utils';

import { useGraphViewport } from '../hooks/useGraphViewport';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { ServiceMapGraph } from '../types';
import { layeredLayout } from '../utils/layout';
import { buildScene, SceneFocus } from '../utils/scene';
import MapEdges from './MapEdges';
import MapLegend from './MapLegend';
import MapNodeButton from './MapNodeButton';
import ZoomControls from './ZoomControls';

interface MapCanvasProps {
	graph: ServiceMapGraph;
	focus: SceneFocus;
	onSelect: (id: string) => void;
	onHover: (id: string | null) => void;
}

/**
 * The layered graph: entry points on the left, deeper dependencies to the
 * right, in one pannable and zoomable layer of SVG edges and node buttons.
 */
function MapCanvas({
	graph,
	focus,
	onSelect,
	onHover,
}: MapCanvasProps): JSX.Element {
	const container = useRef<HTMLDivElement>(null);
	const layout = useMemo(
		() =>
			layeredLayout(
				[...graph.nodes]
					.sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id))
					.map((node) => node.id),
				graph.edges,
			),
		[graph],
	);
	const scene = useMemo(
		() => buildScene(graph, layout, focus),
		[graph, layout, focus],
	);
	const viewport = useGraphViewport(container, layout);
	const animate = !usePrefersReducedMotion();
	const { x, y, k } = viewport.view;
	const selectedPoint = focus.selected
		? layout.positions[focus.selected]
		: undefined;
	const { reveal } = viewport;
	useEffect(() => {
		if (selectedPoint) {
			reveal(selectedPoint);
		}
	}, [selectedPoint, reveal]);

	return (
		<>
			<div
				ref={container}
				data-testid="service-map-canvas"
				onPointerDown={viewport.onPointerDown}
				onPointerMove={viewport.onPointerMove}
				onPointerUp={viewport.onPointerUp}
				onPointerCancel={viewport.onPointerUp}
				className={cn(
					'fs-ui tw:relative tw:h-[clamp(460px,62vh,760px)] tw:touch-none tw:overflow-hidden tw:bg-background tw:bg-[radial-gradient(var(--fs-border)_1px,transparent_1.3px)] tw:bg-[length:22px_22px] tw:font-sans tw:select-none',
					viewport.panning ? 'tw:cursor-grabbing' : 'tw:cursor-grab',
				)}
			>
				<div
					className="tw:pointer-events-none tw:absolute tw:top-0 tw:left-0 tw:origin-top-left"
					style={{
						width: layout.width,
						height: layout.height,
						transform: `translate(${x}px, ${y}px) scale(${k})`,
					}}
				>
					<MapEdges
						edges={scene.edges}
						width={layout.width}
						height={layout.height}
						animate={animate}
					/>
					{scene.edges
						.filter((edge) => edge.label)
						.map((edge) => (
							<span
								key={edge.key}
								data-testid="service-map-edge-label"
								style={{ left: edge.mid.x, top: edge.mid.y }}
								className={cn(
									'tw:absolute tw:z-[1] tw:inline-flex tw:h-5 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:items-center tw:rounded-full tw:border tw:px-2 tw:text-[10.5px] tw:whitespace-nowrap tw:tabular-nums',
									edge.tone === 'error'
										? 'tw:border-error tw:bg-error-soft tw:text-error-ink'
										: 'tw:border-border tw:bg-surface-raised tw:text-muted-foreground',
								)}
							>
								{edge.label}
							</span>
						))}
					{scene.nodes.map((item) => (
						<MapNodeButton
							key={item.node.id}
							node={item.node}
							position={item.position}
							size={item.size}
							tone={item.tone}
							selected={item.selected}
							dimmed={item.dimmed}
							onSelect={onSelect}
							onHover={onHover}
						/>
					))}
				</div>
				<ZoomControls
					onZoomIn={viewport.zoomIn}
					onZoomOut={viewport.zoomOut}
					onFit={viewport.fit}
				/>
			</div>
			<MapLegend colorMode={focus.colorMode} />
		</>
	);
}

export default MapCanvas;
