import { Link, useLocation } from 'react-router-dom';
import type { RumtypesErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import Sparkline from 'components/PageTemplate/components/Sparkline';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TagChip from 'components/PageTemplate/components/TagChip';
import { TableCell, TableRow } from 'components/ui/table';
import dayjs from 'dayjs';
import { formatCount } from 'lib/apm/format';
import { formatAgo } from 'lib/rum/format';
import { rumErrorUrl } from 'lib/rum/links';
import { frameLabel } from 'lib/rum/stackFrames';
import { cn } from 'lib/utils';

import { releasesSummary, sessionShare } from '../utils';

interface ErrorGroupRowProps {
	applicationId: string;
	group: RumtypesErrorGroupDTO;
	/** Sessions in the range. */
	totalSessions: number;
	sourceMapMissing: boolean;
}

const NUMBER = 'tw:text-right tw:tabular-nums';
const SMALL = 'tw:text-xs tw:tabular-nums tw:whitespace-nowrap';

function ErrorGroupRow({
	applicationId,
	group,
	totalSessions,
	sourceMapMissing,
}: ErrorGroupRowProps): JSX.Element {
	const { search } = useLocation();
	const releases = releasesSummary(group);
	const share = sessionShare(group.sessions, totalSessions);
	const to = `${rumErrorUrl(applicationId, group.fingerprint)}${search}`;
	const lastSeen = Date.parse(group.lastSeenAt);

	return (
		<TableRow data-testid="rum-error-group">
			<TableCell className="tw:max-w-0 tw:py-2">
				<span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:leading-snug">
					<span className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-1.5">
						<Link
							to={to}
							data-testid="rum-error-group-open"
							title={`fingerprint ${group.fingerprint}`}
							className="tw:font-mono tw:text-[13px] tw:font-medium tw:text-error-ink! tw:hover:underline"
						>
							{group.type}
						</Link>
						{group.newInRelease && (
							<StatusBadge tone="info" testId="rum-error-group-new">
								New in {group.firstSeenRelease}
							</StatusBadge>
						)}
						<TagChip title="fusescope.rum.error.source">{group.source}</TagChip>
					</span>
					<span
						title={group.message}
						className="tw:truncate tw:text-xs tw:text-muted-foreground"
					>
						{group.message || '—'}
					</span>
					<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
						<span className="tw:truncate tw:font-mono tw:text-[11px] tw:text-subtle-foreground">
							{frameLabel(group.topFrame)}
						</span>
						{sourceMapMissing && (
							<StatusBadge
								tone="warning"
								className="tw:flex-none"
								testId="rum-error-group-no-map"
							>
								Source map missing
							</StatusBadge>
						)}
					</span>
				</span>
			</TableCell>
			<TableCell>
				<Sparkline
					values={group.sparkline.counts ?? []}
					strokeClassName={
						group.newInRelease ? 'tw:stroke-error' : 'tw:stroke-series-1'
					}
					className="tw:w-28"
				/>
			</TableCell>
			<TableCell className={cn(NUMBER, 'tw:font-medium')}>
				{formatCount(group.events)}
			</TableCell>
			<TableCell className={NUMBER}>
				<span className="tw:flex tw:flex-col tw:leading-snug">
					<span>{formatCount(group.sessions)}</span>
					{share && (
						<span
							data-testid="rum-error-group-share"
							className="tw:text-[11px] tw:text-subtle-foreground"
						>
							{share}
						</span>
					)}
				</span>
			</TableCell>
			<TableCell>
				<span className="tw:flex tw:items-center tw:gap-1">
					{releases.first ? <TagChip>{releases.first}</TagChip> : <span>—</span>}
					{releases.more > 0 && (
						<span
							title={(group.releases ?? []).join(', ')}
							className="tw:text-xs tw:text-subtle-foreground"
						>
							+{releases.more}
						</span>
					)}
				</span>
			</TableCell>
			<TableCell className={cn(SMALL, 'tw:text-muted-foreground')}>
				{dayjs(group.firstSeenAt).format('MMM D, HH:mm')}
			</TableCell>
			<TableCell className={SMALL}>
				{formatAgo(Number.isNaN(lastSeen) ? undefined : lastSeen)}
			</TableCell>
		</TableRow>
	);
}

export default ErrorGroupRow;
