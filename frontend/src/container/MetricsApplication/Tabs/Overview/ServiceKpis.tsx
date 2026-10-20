import DeltaText from 'components/PageTemplate/components/DeltaText';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { formatCount } from 'lib/apm/format';
import { PeriodStats } from 'lib/apm/types';

import { KpiDelta, kpiDeltas, latencyParts } from './kpiFormat';

interface ServiceKpisProps {
	current?: PeriodStats;
	previous?: PeriodStats;
	isLoading: boolean;
	compare: boolean;
}

const PLACEHOLDER = '–';

function note(delta: KpiDelta | undefined): JSX.Element | undefined {
	return delta ? (
		<DeltaText text={delta.text} tone={delta.tone} previous={delta.previous} />
	) : undefined;
}

/** The service's totals in the range, each against the previous period. */
function ServiceKpis({
	current,
	previous,
	isLoading,
	compare,
}: ServiceKpisProps): JSX.Element | null {
	if (!isLoading && !current) {
		return null;
	}
	const deltas = kpiDeltas(current, compare ? previous : undefined);
	const p99 = latencyParts(current?.p99);
	const avg = latencyParts(current?.avg);
	const value = (text: string | undefined): string =>
		current && text !== undefined ? text : PLACEHOLDER;

	return (
		<KpiStrip
			label="Service metrics"
			testId="service-kpis"
			className="tw:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] tw:rounded-xl"
		>
			<Stat
				label="Requests"
				value={value(formatCount(current?.requests))}
				note={note(deltas.requests)}
				testId="kpi-requests"
			/>
			<Stat
				label="Rate"
				value={value(current?.rate.toFixed(2))}
				unit="req/s"
				note={note(deltas.rate)}
				testId="kpi-rate"
			/>
			<Stat
				label="Error rate"
				value={value(current?.errorRate.toFixed(1))}
				unit="%"
				note={note(deltas.errorRate)}
				testId="kpi-error-rate"
			/>
			<Stat
				label="Errors"
				value={value(formatCount(current?.errors))}
				note={note(deltas.errors)}
				testId="kpi-errors"
			/>
			<Stat
				label="p99 latency"
				value={value(p99.value)}
				unit={current ? p99.unit : undefined}
				note={note(deltas.p99)}
				testId="kpi-p99"
			/>
			<Stat
				label="Avg latency"
				value={value(avg.value)}
				unit={current ? avg.unit : undefined}
				note={note(deltas.avg)}
				testId="kpi-avg"
			/>
			<Stat
				label="Apdex"
				value={value(current?.apdex?.toFixed(2))}
				note={note(deltas.apdex)}
				testId="kpi-apdex"
			/>
		</KpiStrip>
	);
}

export default ServiceKpis;
