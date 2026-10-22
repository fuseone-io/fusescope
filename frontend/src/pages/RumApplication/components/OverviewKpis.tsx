import DeltaText from 'components/PageTemplate/components/DeltaText';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { formatCount, formatPercent } from 'lib/apm/format';
import { errorRateDelta } from 'lib/rum/errorRate';
import { formatCountChange, formatPointChange } from 'lib/rum/format';
import { ApplicationOverview } from 'lib/rum/overviewTypes';

import VitalStat from './VitalStat';

interface OverviewKpisProps {
	overview: ApplicationOverview;
}

function OverviewKpis({ overview }: OverviewKpisProps): JSX.Element {
	const { current, previous, views, vitals } = overview;
	const sessionsChange = formatCountChange(current.sessions, previous?.sessions);
	const errorChange = errorRateDelta(current.errorRate, previous?.errorRate);
	const perSession = current.sessions > 0 ? views / current.sessions : undefined;

	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-2 tw:font-sans">
			<KpiStrip label="Key metrics" testId="rum-overview-kpis">
				<Stat
					label="Sessions"
					value={formatCount(current.sessions)}
					note={
						sessionsChange && (
							<DeltaText
								text={sessionsChange}
								tone="neutral"
								previous="previous period"
							/>
						)
					}
					testId="rum-overview-sessions"
				/>
				<Stat
					label="Views"
					value={formatCount(views)}
					note={perSession !== undefined && `${perSession.toFixed(1)} per session`}
					testId="rum-overview-views"
				/>
				<Stat
					label="Session error rate"
					value={
						current.errorRate === undefined ? '—' : current.errorRate.toFixed(1)
					}
					unit={current.errorRate === undefined ? undefined : '%'}
					note={
						errorChange !== undefined && (
							<DeltaText
								text={formatPointChange(errorChange) ?? ''}
								tone={errorChange > 0.5 ? 'bad' : 'neutral'}
								previous={formatPercent(previous?.errorRate)}
							/>
						)
					}
					testId="rum-overview-error-rate"
				/>
				<VitalStat vital="lcp" summary={vitals.lcp} />
				<VitalStat vital="inp" summary={vitals.inp} />
				<VitalStat vital="cls" summary={vitals.cls} />
			</KpiStrip>
			<p className="tw:flex tw:flex-wrap tw:justify-between tw:gap-x-4 tw:gap-y-1 tw:px-1 tw:text-xs tw:text-subtle-foreground">
				<span>
					Vitals from{' '}
					<span className="tw:tabular-nums">
						{formatCount(vitals.lcp?.samples ?? 0)}
					</span>{' '}
					page loads. Bars split them into good, needs improvement and poor.
				</span>
				<span>LCP good ≤ 2.5 s · INP good ≤ 200 ms · CLS good ≤ 0.1</span>
			</p>
		</div>
	);
}

export default OverviewKpis;
