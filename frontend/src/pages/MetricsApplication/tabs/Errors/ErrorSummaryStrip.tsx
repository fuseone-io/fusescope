import DeltaText from 'components/PageTemplate/components/DeltaText';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { deltaTone, relativeDelta } from 'lib/apm/delta';
import { ErrorSummary } from 'lib/apm/errors';
import { formatCount, formatPercent } from 'lib/apm/format';
import { errorRateKpiDelta } from 'container/MetricsApplication/Tabs/Overview/kpiFormat';

interface ErrorSummaryStripProps {
	summary: ErrorSummary;
}

/** Error spans and rate against the previous period, split by whether an exception was recorded. */
function ErrorSummaryStrip({ summary }: ErrorSummaryStripProps): JSX.Element {
	const rateDelta =
		summary.previousErrorRate !== undefined
			? errorRateKpiDelta(summary.errorRate, summary.previousErrorRate)
			: undefined;
	return (
		<KpiStrip
			label="Error summary"
			testId="service-error-summary"
			className="tw:rounded-xl"
		>
			<Stat
				label="Error spans"
				value={formatCount(summary.errorSpans)}
				note={
					summary.previousErrorSpans !== undefined ? (
						<DeltaText
							text={relativeDelta(summary.errorSpans, summary.previousErrorSpans)}
							tone={deltaTone(
								'higher-is-bad',
								summary.errorSpans,
								summary.previousErrorSpans,
							)}
							previous={formatCount(summary.previousErrorSpans)}
						/>
					) : undefined
				}
				testId="errors-spans"
			/>
			<Stat
				label="Error rate"
				value={formatPercent(summary.errorRate).replace('%', '')}
				unit="%"
				note={
					rateDelta ? (
						<DeltaText
							text={rateDelta.text}
							tone={rateDelta.tone}
							previous={rateDelta.previous}
						/>
					) : undefined
				}
				testId="errors-rate"
			/>
			<Stat
				label="With exception"
				value={formatCount(summary.withException)}
				note={`${summary.exceptionTypes} exception ${summary.exceptionTypes === 1 ? 'type' : 'types'}`}
				testId="errors-with-exception"
			/>
			<Stat
				label="Status only"
				value={formatCount(summary.statusOnly)}
				note="error status, no exception event"
				testId="errors-status-only"
			/>
		</KpiStrip>
	);
}

export default ErrorSummaryStrip;
