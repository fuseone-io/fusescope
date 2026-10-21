import { Link } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { useDependencyLink } from 'pages/MetricsApplication/tabs/Dependencies/useDependencyLink';
import {
	traceFilter,
	useTracesLink,
} from 'pages/MetricsApplication/hooks/useTracesLink';
import { DraftingCompass, Globe } from 'lucide-react';

import { PANEL_ROWS } from '../../constants';
import { MapNode, ServiceMapGraph } from '../../types';
import { neighbourRows } from '../../utils/neighbours';
import { dependencyTiles } from '../../utils/tiles';
import KpiTiles from './KpiTiles';
import LatencyBars from './LatencyBars';
import PanelHeader from './PanelHeader';
import PanelSection from './PanelSection';
import ResourceAttributes from './ResourceAttributes';
import StatRows from './StatRows';

interface DependencyDetailsProps {
	node: MapNode;
	graph: ServiceMapGraph;
	onSelect: (id: string) => void;
}

/** A dependency without an SDK, as its callers' client spans describe it. */
function DependencyDetails({
	node,
	graph,
	onSelect,
}: DependencyDetailsProps): JSX.Element {
	const { callers } = neighbourRows(node.id, graph.nodes, graph.edges);
	const caller = callers[0]?.name ?? node.id;
	const tracesLink = useTracesLink(caller);
	const dependencyLink = useDependencyLink(caller);
	const from = node.inferredFrom;
	const isAddress = from?.attribute === 'server.address';

	return (
		<>
			<PanelHeader
				node={node}
				links={
					isAddress ? (
						<Button asChild variant="outline" size="sm">
							<Link
								to={dependencyLink({
									name: node.id,
									kind: 'External',
									rate: node.rate,
									errorRate: node.errorRate,
								})}
								data-testid="service-map-node-external"
							>
								<Globe aria-hidden="true" />
								External APIs
							</Link>
						</Button>
					) : (
						<Button asChild variant="outline" size="sm">
							<Link
								to={tracesLink(from ? [traceFilter(from.attribute, from.value)] : [])}
								data-testid="service-map-node-traces"
							>
								<DraftingCompass aria-hidden="true" />
								Traces from {caller}
							</Link>
						</Button>
					)
				}
			/>
			<KpiTiles tiles={dependencyTiles(node, callers.length)} />
			{node.p99 !== undefined && (
				<PanelSection title="Latency" hint="duration of callers' client spans">
					<LatencyBars latency={{ p50: node.p50, p95: node.p95, p99: node.p99 }} />
				</PanelSection>
			)}
			<PanelSection title={`Callers · ${callers.length}`} hint="req/s · err · p99">
				<StatRows
					rows={callers.slice(0, PANEL_ROWS)}
					empty="No callers in this time range."
					onSelect={onSelect}
					testId="service-map-node-callers"
				/>
			</PanelSection>
			<PanelSection title="Identified by">
				<ResourceAttributes
					attributes={[
						...(from ? [[from.attribute, [from.value]] as [string, string[]]] : []),
						['seen in spans of', callers.map((row) => row.name)],
					]}
				/>
			</PanelSection>
		</>
	);
}

export default DependencyDetails;
