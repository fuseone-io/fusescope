import DeltaText from 'components/PageTemplate/components/DeltaText';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { formatCount, formatPercent } from 'lib/apm/format';
import { START_TYPES } from 'lib/rum/appStart';
import { errorRateDelta } from 'lib/rum/errorRate';
import { formatCountChange, formatPointChange } from 'lib/rum/format';
import { ApplicationOverview } from 'lib/rum/overviewTypes';

import AppStartStat from './AppStartStat';
import VitalStat from './VitalStat';

interface OverviewKpisProps {
	overview: ApplicationOverview;
	/** An Android application: app start instead of the Web Vitals. */
	mobile?: boolean;
}

function OverviewKpis({
	overview,
	mobile = false,
}: OverviewKpisProps): JSX.Element {
	const { current, previous, views, vitals, appStart } = overview;
	const appStarts = START_TYPES.reduce(
		(sum, type) => sum + (appStart[type]?.samples ?? 0),
		0,
	);
	const sessionsChange = formatCountChange(current.sessions, previous?.sessions);
	const errorChange = errorRateDelta(current.errorRate, previous?.errorRate);
	const perSession = current.sessions > 0 ? views / current.sessions : undefined;

	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-2 tw:font-sans">
			<KpiStrip
				label="Key metrics"
				testId="rum-overview-kpis"
				className="tw:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"
			>
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
				{mobile ? (
					START_TYPES.map((type) => (
						<AppStartStat key={type} type={type} summary={appStart[type]} />
					))
				) : (
					<>
						<VitalStat vital="lcp" summary={vitals.lcp} />
						<VitalStat vital="inp" summary={vitals.inp} />
						<VitalStat vital="cls" summary={vitals.cls} />
					</>
				)}
			</KpiStrip>
			<p className="tw:flex tw:flex-wrap tw:justify-between tw:gap-x-4 tw:gap-y-1 tw:px-1 tw:text-xs tw:text-subtle-foreground">
				{mobile ? (
					<>
						<span>
							App start from{' '}
							<span className="tw:tabular-nums">{formatCount(appStarts)}</span>{' '}
							launches. Bars split them into good, needs improvement and poor.
						</span>
						<span>Good below 2.5 s cold · 1 s warm · 0.75 s hot</span>
					</>
				) : (
					<>
						<span>
							Vitals from{' '}
							<span className="tw:tabular-nums">
								{formatCount(vitals.lcp?.samples ?? 0)}
							</span>{' '}
							page loads. Bars split them into good, needs improvement and poor.
						</span>
						<span>LCP good ≤ 2.5 s · INP good ≤ 200 ms · CLS good ≤ 0.1</span>
					</>
				)}
			</p>
		</div>
	);
}

export default OverviewKpis;
