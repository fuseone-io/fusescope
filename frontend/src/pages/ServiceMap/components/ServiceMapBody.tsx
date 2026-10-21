import { useMemo } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { ServiceApm } from 'lib/apm/servicesList';

import { useServiceMapView } from '../hooks/useServiceMapView';
import { ServiceMapGraph } from '../types';
import { visibleGraph } from '../utils/graph';
import { mapKpis } from '../utils/kpis';
import { findRootCauses } from '../utils/rootCause';
import { SceneFocus } from '../utils/scene';
import DependenciesTable from './DependenciesTable';
import MapCanvas from './MapCanvas';
import MapKpis from './MapKpis';
import MapToolbar from './MapToolbar';
import NodePanel from './NodePanel/NodePanel';
import RootCauseBanner from './RootCauseBanner';

interface ServiceMapBodyProps {
	graph: ServiceMapGraph;
	stats: Record<string, ServiceApm>;
}

/** KPIs, root cause, the graph with the selected node, and every dependency. */
function ServiceMapBody({ graph, stats }: ServiceMapBodyProps): JSX.Element {
	const view = useServiceMapView();
	const kpis = useMemo(() => mapKpis(graph), [graph]);
	const causes = useMemo(() => findRootCauses(graph), [graph]);
	const shown = useMemo(
		() => visibleGraph(graph, view.showDependencies),
		[graph, view.showDependencies],
	);
	const selectedNode = graph.nodes.find((node) => node.id === view.selected);
	const focus = useMemo<SceneFocus>(
		() => ({
			selected: shown.nodes.some((node) => node.id === view.selected)
				? view.selected
				: null,
			hovered: view.hovered,
			path: view.highlightPath && causes[0] ? causes[0].path : null,
			search: view.search,
			colorMode: view.colorMode,
		}),
		[
			shown,
			view.selected,
			view.hovered,
			view.highlightPath,
			causes,
			view.search,
			view.colorMode,
		],
	);

	return (
		<>
			<MapKpis kpis={kpis} />
			{causes.length > 0 && (
				<RootCauseBanner
					causes={causes}
					highlighted={view.highlightPath}
					onToggleHighlight={view.toggleHighlightPath}
					onSelect={view.select}
				/>
			)}
			<div className="tw:flex tw:flex-wrap tw:items-start tw:gap-3">
				<ContentPanel testId="service-map-graph" className="tw:flex-[999_1_560px]">
					<MapToolbar
						search={view.search}
						onSearch={view.setSearch}
						colorMode={view.colorMode}
						onColorMode={view.setColorMode}
						showDependencies={view.showDependencies}
						onShowDependencies={view.setShowDependencies}
					/>
					<MapCanvas
						graph={shown}
						focus={focus}
						onSelect={view.select}
						onHover={view.setHovered}
					/>
				</ContentPanel>
				<NodePanel
					node={selectedNode}
					graph={graph}
					stats={stats}
					onSelect={view.select}
				/>
			</div>
			<DependenciesTable edges={graph.edges} onSelect={view.select} />
		</>
	);
}

export default ServiceMapBody;
