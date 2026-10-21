import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';

import { PROTOCOL_LABEL } from '../constants';
import { MapKpis as MapKpisType } from '../types';

interface MapKpisProps {
	kpis: MapKpisType;
}

const list = (names: string[], max = 3): string =>
	names.length > max
		? `${names.slice(0, max).join(', ')} +${names.length - max}`
		: names.join(', ');

/** Services, connections, ingress traffic and errors over the range. */
function MapKpis({ kpis }: MapKpisProps): JSX.Element {
	const [rate, rateUnit] = formatRate(kpis.ingressRate).split(' ');
	return (
		<KpiStrip
			label="Service map summary"
			testId="service-map-kpis"
			className="tw:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] tw:rounded-xl"
		>
			<Stat
				label="Services"
				value={kpis.services}
				note={`+ ${kpis.inferred} inferred ${kpis.inferred === 1 ? 'dependency' : 'dependencies'}`}
				testId="service-map-kpi-services"
			/>
			<Stat
				label="Connections"
				value={kpis.connections}
				note={
					kpis.protocols.length
						? kpis.protocols.map((protocol) => PROTOCOL_LABEL[protocol]).join(', ')
						: 'Caller → callee pairs'
				}
				testId="service-map-kpi-connections"
			/>
			<Stat
				label="Ingress throughput"
				value={rate}
				unit={rateUnit}
				note={kpis.entryPoints.length ? `at ${list(kpis.entryPoints)}` : undefined}
				testId="service-map-kpi-throughput"
			/>
			<Stat
				label="Ingress error rate"
				value={formatPercent(kpis.ingressErrorRate)}
				note={`${kpis.failingConnections} ${kpis.failingConnections === 1 ? 'connection' : 'connections'} at 5% errors or more`}
				testId="service-map-kpi-errors"
			/>
			<Stat
				label="Unhealthy services"
				value={
					<span className={cn(kpis.unhealthy.length > 0 && 'tw:text-error')}>
						{kpis.unhealthy.length}
					</span>
				}
				note={kpis.unhealthy.length ? list(kpis.unhealthy) : 'None critical'}
				testId="service-map-kpi-unhealthy"
			/>
		</KpiStrip>
	);
}

export default MapKpis;
