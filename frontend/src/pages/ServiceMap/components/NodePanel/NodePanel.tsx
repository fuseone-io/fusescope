import { ServiceApm } from 'lib/apm/servicesList';
import { MousePointerClick } from 'lucide-react';

import { MapNode, ServiceMapGraph } from '../../types';
import DependencyDetails from './DependencyDetails';
import ServiceDetails from './ServiceDetails';

interface NodePanelProps {
	node: MapNode | undefined;
	graph: ServiceMapGraph;
	stats: Record<string, ServiceApm>;
	onSelect: (id: string) => void;
}

/** The selected node's details beside the graph. */
function NodePanel({
	node,
	graph,
	stats,
	onSelect,
}: NodePanelProps): JSX.Element {
	let body = (
		<div
			data-testid="service-map-node-empty"
			className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-6 tw:py-16 tw:text-center tw:text-[13px] tw:text-muted-foreground"
		>
			<MousePointerClick
				aria-hidden="true"
				className="tw:size-5 tw:text-subtle-foreground"
			/>
			Select a service on the map to see its traffic, latency, callers and calls.
		</div>
	);
	if (node?.inferred) {
		body = (
			<DependencyDetails
				key={node.id}
				node={node}
				graph={graph}
				onSelect={onSelect}
			/>
		);
	} else if (node) {
		body = (
			<ServiceDetails
				key={node.id}
				node={node}
				graph={graph}
				apm={stats[node.id]}
				onSelect={onSelect}
			/>
		);
	}
	return (
		<aside
			aria-label={node ? `Details for ${node.id}` : 'Node details'}
			data-testid="service-map-node-panel"
			className="fs-ui tw:flex tw:max-w-full tw:min-w-0 tw:flex-[1_1_320px] tw:flex-col tw:self-start tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground tw:lg:max-w-[400px]"
		>
			{body}
		</aside>
	);
}

export default NodePanel;
