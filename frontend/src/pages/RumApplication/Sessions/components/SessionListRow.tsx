import { Link, useLocation } from 'react-router-dom';
import type { RumtypesSessionSummaryDTO } from 'api/generated/services/fuseScope.schemas';
import { TableCell, TableRow } from 'components/ui/table';
import dayjs from 'dayjs';
import { clientLabel } from 'lib/rum/client';
import { formatSessionDuration, shortId } from 'lib/rum/format';
import { rumSessionUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';

interface SessionListRowProps {
	applicationId: string;
	session: RumtypesSessionSummaryDTO;
}

const NUMBER = 'tw:text-right tw:tabular-nums';
const LINK = 'tw:font-mono tw:text-xs tw:text-primary! tw:hover:underline';

function SessionListRow({
	applicationId,
	session,
}: SessionListRowProps): JSX.Element {
	const { search } = useLocation();
	const sessionUrl = (id: string): string =>
		`${rumSessionUrl(applicationId, id)}${search}`;
	return (
		<TableRow data-testid="rum-sessions-row">
			<TableCell>
				<span className="tw:flex tw:flex-col tw:leading-snug">
					<Link
						to={sessionUrl(session.sessionId)}
						title={`session.id ${session.sessionId}`}
						data-testid="rum-sessions-open"
						className={cn(LINK, 'tw:font-medium')}
					>
						{shortId(session.sessionId)}
					</Link>
					{session.previousSessionId && (
						<span className="tw:text-[11px] tw:text-subtle-foreground">
							after{' '}
							<Link
								to={sessionUrl(session.previousSessionId)}
								title={`session.previous_id ${session.previousSessionId}`}
								data-testid="rum-sessions-previous"
								className="tw:font-mono tw:text-muted-foreground! tw:hover:underline"
							>
								{shortId(session.previousSessionId)}
							</Link>
						</span>
					)}
				</span>
			</TableCell>
			<TableCell
				title={session.userId ? `user.id ${session.userId}` : undefined}
				className={cn(
					'tw:font-mono tw:text-xs',
					session.userId ? 'tw:text-foreground' : 'tw:text-subtle-foreground',
				)}
			>
				{session.userId ? shortId(session.userId) : '—'}
			</TableCell>
			<TableCell className="tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums">
				{dayjs(session.startedAt).format('MMM D, HH:mm:ss')}
			</TableCell>
			<TableCell className={NUMBER}>
				{formatSessionDuration(session.durationMs)}
			</TableCell>
			<TableCell className={NUMBER}>{session.views}</TableCell>
			<TableCell className={NUMBER}>{session.actions}</TableCell>
			<TableCell
				className={cn(
					NUMBER,
					session.errors > 0
						? 'tw:font-semibold tw:text-error-ink'
						: 'tw:text-muted-foreground',
				)}
			>
				{session.errors}
			</TableCell>
			<TableCell className="tw:max-w-0 tw:truncate">
				{clientLabel(session.client)}
			</TableCell>
			<TableCell className="tw:font-mono tw:text-xs tw:text-muted-foreground">
				{session.release || '—'}
			</TableCell>
		</TableRow>
	);
}

export default SessionListRow;
