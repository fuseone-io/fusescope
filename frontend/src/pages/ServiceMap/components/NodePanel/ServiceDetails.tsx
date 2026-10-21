import { Link, useLocation } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { ServiceApm } from 'lib/apm/servicesList';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useServiceExplorerLinks } from 'pages/MetricsApplication/hooks/useServiceExplorerLinks';
import { serviceUrl } from 'pages/Services/components/ServicesList/utils';
import { DraftingCompass, LineChart, ScrollText } from 'lucide-react';

import { PANEL_ROWS } from '../../constants';
import { useServiceDetails } from '../../hooks/useServiceDetails';
import { MapNode, ServiceMapGraph } from '../../types';
import { neighbourRows, operationRows } from '../../utils/neighbours';
import { serviceTiles } from '../../utils/tiles';
import KpiTiles from './KpiTiles';
import LatencyBars from './LatencyBars';
import PanelHeader from './PanelHeader';
import PanelSection from './PanelSection';
import ResourceAttributes from './ResourceAttributes';
import StatRows from './StatRows';

interface ServiceDetailsProps {
	node: MapNode;
	graph: ServiceMapGraph;
	apm: ServiceApm | undefined;
	onSelect: (id: string) => void;
}

const COLUMNS = 'req/s · err · p99';

/** A service that reports its own spans: the Services pages' numbers for it. */
function ServiceDetails({
	node,
	graph,
	apm,
	onSelect,
}: ServiceDetailsProps): JSX.Element {
	const { search } = useLocation();
	const { tracesUrl, logsUrl } = useServiceExplorerLinks(node.id);
	const window = useApmWindow();
	const details = useServiceDetails(node.id);
	const { callers, calls } = neighbourRows(node.id, graph.nodes, graph.edges);
	const server = details.details.serverLatency;
	const latency = server ?? { p50: node.p50, p95: node.p95, p99: node.p99 };

	return (
		<>
			<PanelHeader
				node={node}
				links={
					<>
						<Button asChild variant="outline" size="sm">
							<Link to={tracesUrl} data-testid="service-map-node-traces">
								<DraftingCompass aria-hidden="true" />
								Traces
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm">
							<Link to={logsUrl} data-testid="service-map-node-logs">
								<ScrollText aria-hidden="true" />
								Logs
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm">
							<Link
								to={serviceUrl(node.id, search)}
								data-testid="service-map-node-overview"
							>
								<LineChart aria-hidden="true" />
								Service overview
							</Link>
						</Button>
					</>
				}
			/>
			<KpiTiles
				tiles={serviceTiles(details.current, details.previous, apm?.sparks)}
			/>
			<PanelSection
				title="Latency"
				hint={server ? 'duration of SERVER spans' : 'entry-point spans'}
			>
				<LatencyBars latency={latency} />
			</PanelSection>
			<PanelSection title={`Callers · ${callers.length}`} hint={COLUMNS}>
				<StatRows
					rows={callers.slice(0, PANEL_ROWS)}
					empty="No callers. This is an entry point."
					onSelect={onSelect}
					testId="service-map-node-callers"
				/>
			</PanelSection>
			<PanelSection title={`Calls · ${calls.length}`} hint={COLUMNS}>
				<StatRows
					rows={calls.slice(0, PANEL_ROWS)}
					empty="No outgoing calls in this time range."
					onSelect={onSelect}
					testId="service-map-node-calls"
				/>
			</PanelSection>
			<PanelSection title="Top operations" hint={COLUMNS}>
				<StatRows
					rows={operationRows(details.operations, window.seconds)}
					empty="No operations in this time range."
					testId="service-map-node-operations"
				/>
			</PanelSection>
			<PanelSection title="Resource attributes">
				<ResourceAttributes attributes={details.details.attributes} />
			</PanelSection>
		</>
	);
}

export default ServiceDetails;
