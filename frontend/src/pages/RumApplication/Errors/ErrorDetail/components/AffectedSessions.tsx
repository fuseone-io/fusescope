import { Link } from 'react-router-dom';
import type { RumtypesAffectedSessionDTO } from 'api/generated/services/fuseScope.schemas';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import dayjs from 'dayjs';
import { formatCount } from 'lib/apm/format';
import { clientLabel } from 'lib/rum/client';
import { shortId } from 'lib/rum/format';

import EmptyRow from '../../../components/EmptyRow';

interface AffectedSessionsProps {
	sessions: RumtypesAffectedSessionDTO[];
	/** Sessions of the group in the range. */
	total: number;
	sessionUrl: (sessionId: string) => string;
}

const RIGHT = 'tw:text-right tw:tabular-nums';

function AffectedSessions({
	sessions,
	total,
	sessionUrl,
}: AffectedSessionsProps): JSX.Element {
	return (
		<section
			aria-labelledby="rum-error-sessions"
			data-testid="rum-error-sessions"
			className="tw:border-t tw:border-border"
		>
			<div className="tw:flex tw:items-baseline tw:justify-between tw:gap-2 tw:px-5 tw:pt-3.5 tw:pb-2.5">
				<h3
					id="rum-error-sessions"
					className="tw:m-0 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
				>
					Affected sessions
				</h3>
				<span className="tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
					Latest {sessions.length} of {formatCount(total)}
				</span>
			</div>
			<div className="tw:overflow-x-auto tw:border-t tw:border-border">
				<Table className="tw:min-w-[760px]">
					<TableHeader>
						<TableRow>
							<TableHead>Session</TableHead>
							<TableHead>Started</TableHead>
							<TableHead>Release</TableHead>
							<TableHead>Browser · OS</TableHead>
							<TableHead className={RIGHT}>Views</TableHead>
							<TableHead className={RIGHT}>Errors</TableHead>
							<TableHead>
								<span className="tw:sr-only">Timeline</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sessions.map((session) => (
							<TableRow key={session.sessionId} data-testid="rum-error-session-row">
								<TableCell
									title={`session.id ${session.sessionId}`}
									className="tw:font-mono tw:text-xs"
								>
									{shortId(session.sessionId)}
								</TableCell>
								<TableCell className="tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums">
									{dayjs(session.startedAt).format('MMM D, HH:mm:ss')}
								</TableCell>
								<TableCell className="tw:font-mono tw:text-xs tw:text-muted-foreground">
									{session.release || '—'}
								</TableCell>
								<TableCell className="tw:max-w-0 tw:truncate tw:text-xs">
									{clientLabel(session.client)}
								</TableCell>
								<TableCell className={RIGHT}>{session.views}</TableCell>
								<TableCell className={`${RIGHT} tw:font-semibold tw:text-error-ink`}>
									{session.errors}
								</TableCell>
								<TableCell className="tw:text-right">
									<Link
										to={sessionUrl(session.sessionId)}
										data-testid="rum-error-session-open"
										className="tw:text-xs tw:font-medium tw:text-primary! tw:hover:underline"
									>
										Timeline
									</Link>
								</TableCell>
							</TableRow>
						))}
						{sessions.length === 0 && (
							<EmptyRow columns={7}>No sessions in this range.</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}

export default AffectedSessions;
