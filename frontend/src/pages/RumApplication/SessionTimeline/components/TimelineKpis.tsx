import type { RumtypesGettableSessionDTO } from 'api/generated/services/fuseScope.schemas';
import dayjs from 'dayjs';
import { formatSessionDuration, plural } from 'lib/rum/format';
import { cn } from 'lib/utils';

interface TimelineKpisProps {
	session: RumtypesGettableSessionDTO;
}

function TimelineKpis({ session }: TimelineKpisProps): JSX.Element {
	const kpis = [
		{
			label: 'Started',
			value: dayjs(session.startedAt).format('HH:mm:ss'),
			note: dayjs(session.startedAt).format('MMM D'),
		},
		{ label: 'Duration', value: formatSessionDuration(session.durationMs) },
		{
			label: 'Views',
			value: String(session.views),
			note: `${session.pageLoads} ${plural(session.pageLoads, 'page load')}`,
		},
		{ label: 'Actions', value: String(session.actions) },
		{
			label: 'Requests',
			value: String(session.requests),
			note:
				session.failedRequests > 0 ? `${session.failedRequests} failed` : undefined,
		},
		{
			label: 'Errors',
			value: String(session.errors),
			bad: session.errors > 0,
		},
	];
	return (
		<dl
			data-testid="rum-session-kpis"
			className="tw:m-0 tw:grid tw:grid-cols-[repeat(auto-fit,minmax(130px,1fr))] tw:gap-px tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-border"
		>
			{kpis.map((kpi) => (
				<div
					key={kpi.label}
					className="tw:flex tw:flex-col tw:gap-1 tw:bg-surface-raised tw:px-4 tw:py-3"
				>
					<dt className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						{kpi.label}
					</dt>
					<dd
						className={cn(
							'tw:m-0 tw:flex tw:items-baseline tw:gap-2 tw:text-lg tw:font-semibold tw:tabular-nums',
							kpi.bad && 'tw:text-error-ink',
						)}
					>
						{kpi.value}
						{kpi.note && (
							<span className="tw:text-xs tw:font-normal tw:text-subtle-foreground">
								{kpi.note}
							</span>
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}

export default TimelineKpis;
