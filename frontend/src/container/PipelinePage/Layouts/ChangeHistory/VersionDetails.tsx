import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { useTimezone } from 'providers/Timezone';
import { HistoryData } from 'types/api/pipeline/def';

import { getDeploymentStage } from './utils';

const STAGE_TONE: Record<string, StatusTone> = {
	deployed: 'success',
	failed: 'error',
	dirty: 'warning',
	in_progress: 'info',
};

/** The picked configuration version's fields, as on the history board. */
function VersionDetails({ version }: { version: HistoryData }): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const time = formatTimezoneAdjustedTimestamp(
		version.createdAt,
		DATE_TIME_FORMATS.UTC_MONTH_FULL,
	);
	const stage = getDeploymentStage(version.deployStatus);

	return (
		<section
			aria-label="Version details"
			data-testid="pipeline-version-details"
			className="fs-ui tw:flex tw:min-w-0 tw:flex-[1_1_340px] tw:flex-col tw:self-start tw:rounded-xl tw:border tw:border-border tw:bg-card tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:pt-4 tw:pb-3">
				<div className="tw:min-w-0">
					<h2 className="tw:m-0 tw:text-sm tw:font-semibold">
						Version{' '}
						<span className="tw:font-mono tw:tabular-nums">v{version.version}</span>
					</h2>
					<p className="tw:mt-0.5 tw:mb-0 tw:text-xs tw:text-muted-foreground">
						{time}
					</p>
				</div>
				{stage && (
					<StatusBadge tone={STAGE_TONE[version.deployStatus] ?? 'neutral'} dot>
						{stage}
					</StatusBadge>
				)}
			</div>
			<div className="tw:flex tw:flex-col tw:gap-4 tw:px-5 tw:py-4">
				<dl className="tw:m-0 tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-4 tw:gap-y-2 tw:text-[13px]">
					<dt className="tw:text-muted-foreground">Deployment stage</dt>
					<dd className="tw:m-0 tw:font-medium">{stage || '—'}</dd>
					<dt className="tw:text-muted-foreground">Last deployed time</dt>
					<dd className="tw:m-0 tw:tabular-nums">{time}</dd>
					<dt className="tw:text-muted-foreground">Edited by</dt>
					<dd className="tw:m-0">{version.createdByName}</dd>
				</dl>
				<div className="tw:flex tw:flex-col tw:gap-1.5">
					<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Last deploy message
					</span>
					<div className="tw:rounded-lg tw:border tw:border-border tw:bg-muted tw:px-3 tw:py-2.5 tw:font-mono tw:text-xs tw:break-words tw:whitespace-pre-wrap">
						{version.deployResult || '—'}
					</div>
				</div>
			</div>
		</section>
	);
}

export default VersionDetails;
