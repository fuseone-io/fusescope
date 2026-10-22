import DeltaText from 'components/PageTemplate/components/DeltaText';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { formatCount, formatPercent } from 'lib/apm/format';
import { errorRateDelta } from 'lib/rum/errorRate';
import { formatCountChange, formatPointChange } from 'lib/rum/format';

import { ApplicationsKpis as Kpis } from '../types';

interface ApplicationsKpisProps {
	kpis: Kpis;
}

const value = (number: number | undefined, digits = 1): string =>
	number === undefined ? '—' : number.toFixed(digits);

function ApplicationsKpis({ kpis }: ApplicationsKpisProps): JSX.Element {
	const sessionsChange = formatCountChange(kpis.sessions, kpis.previousSessions);
	const errorChange = errorRateDelta(kpis.errorRate, kpis.previousErrorRate);
	const outdated = kpis.outdated[0];
	const more =
		kpis.outdated.length > 1 ? ` and ${kpis.outdated.length - 1} more` : '';

	return (
		<KpiStrip label="Key metrics" testId="rum-applications-kpis">
			<Stat
				label="Applications"
				value={kpis.applications}
				note={`${kpis.web} web · ${kpis.mobile} mobile`}
				testId="rum-kpi-applications"
			/>
			<Stat
				label="Sessions"
				value={formatCount(kpis.sessions)}
				note={
					sessionsChange && (
						<DeltaText
							text={sessionsChange}
							tone="neutral"
							previous="previous period"
						/>
					)
				}
				testId="rum-kpi-sessions"
			/>
			<Stat
				label="Session error rate"
				value={value(kpis.errorRate)}
				unit={kpis.errorRate === undefined ? undefined : '%'}
				note={
					errorChange !== undefined && (
						<DeltaText
							text={formatPointChange(errorChange) ?? ''}
							tone={errorChange > 0.5 ? 'bad' : 'neutral'}
							previous={formatPercent(kpis.previousErrorRate)}
						/>
					)
				}
				testId="rum-kpi-error-rate"
			/>
			<Stat
				label="Good LCP"
				value={value(kpis.goodLcp, 0)}
				unit={kpis.goodLcp === undefined ? undefined : '% of loads'}
				note="LCP ≤ 2.5 s"
				testId="rum-kpi-good-lcp"
			/>
			<Stat
				label="Outdated SDKs"
				value={kpis.outdated.length}
				unit={kpis.outdated.length === 1 ? 'app' : 'apps'}
				note={outdated ? `${outdated.application.name}${more}` : 'All supported'}
				testId="rum-kpi-outdated"
			/>
		</KpiStrip>
	);
}

export default ApplicationsKpis;
