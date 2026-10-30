import type { RumtypesGettableErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import dayjs from 'dayjs';
import { formatCount } from 'lib/apm/format';
import { formatAgo } from 'lib/rum/format';
import { cn } from 'lib/utils';

import { sessionShare } from '../../utils';
import { topClient } from '../utils';

interface ErrorKpisProps {
	group: RumtypesGettableErrorGroupDTO;
	jvm: boolean;
	totalSessions?: number;
}

const releaseNote = (release: string): string =>
	release ? `release ${release}` : 'no release';

function ErrorKpis({ group, totalSessions, jvm }: ErrorKpisProps): JSX.Element {
	const share =
		totalSessions === undefined
			? undefined
			: sessionShare(group.sessions, totalSessions);
	const client = topClient(group.latestEvents ?? [], jvm);
	const lastSeen = Date.parse(group.lastSeenAt);
	const kpis = [
		{
			label: 'Events',
			value: formatCount(group.events),
			note: 'in this range',
			big: true,
		},
		{
			label: 'Sessions affected',
			value: formatCount(group.sessions),
			note: share ? `${share} of sessions` : '',
			big: true,
		},
		{
			label: 'First seen',
			value: dayjs(group.firstSeenAt).format('MMM D, HH:mm'),
			note: releaseNote(group.firstSeenRelease),
		},
		{
			label: 'Last seen',
			value: formatAgo(Number.isNaN(lastSeen) ? undefined : lastSeen),
			note: releaseNote(group.lastSeenRelease),
		},
		{
			label: jvm ? 'Top device' : 'Top browser',
			value: client?.label ?? '—',
			note: client?.share ?? '',
		},
	];
	return (
		<dl
			data-testid="rum-error-kpis"
			className="tw:m-0 tw:grid tw:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] tw:gap-px tw:border-b tw:border-border tw:bg-border"
		>
			{kpis.map((kpi) => (
				<div
					key={kpi.label}
					className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:bg-surface-raised tw:px-5 tw:py-3"
				>
					<dt className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						{kpi.label}
					</dt>
					<dd
						className={cn(
							'tw:m-0 tw:truncate tw:tabular-nums',
							kpi.big
								? 'tw:text-xl tw:font-semibold'
								: 'tw:text-[13px] tw:font-medium',
						)}
					>
						{kpi.value}
					</dd>
					<dd className="tw:m-0 tw:truncate tw:text-xs tw:text-subtle-foreground">
						{kpi.note}
					</dd>
				</div>
			))}
		</dl>
	);
}

export default ErrorKpis;
