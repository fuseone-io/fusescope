import { Link } from 'react-router-dom';
import { TableCell, TableRow } from 'components/ui/table';
import dayjs from 'dayjs';
import { formatSessionDuration } from 'lib/rum/format';
import { rumSessionUrl, traceDetailUrl } from 'lib/rum/links';
import { SessionRequest, SessionSummary } from 'lib/rum/overviewTypes';
import { describeUserAgent } from 'lib/rum/userAgent';
import { cn } from 'lib/utils';
import { ArrowUpRight } from 'lucide-react';

import { shortSessionId } from '../utils';

interface SessionRowProps {
	applicationId: string;
	release: string;
	session: SessionSummary;
	errors: number;
	request?: SessionRequest;
}

const NUMBER = 'tw:text-right tw:tabular-nums';

function SessionRow({
	applicationId,
	release,
	session,
	errors,
	request,
}: SessionRowProps): JSX.Element {
	return (
		<TableRow data-testid="rum-session-row">
			<TableCell className="tw:font-mono tw:text-xs">
				<Link
					to={rumSessionUrl(applicationId, session.id, release)}
					title={`session.id ${session.id}`}
					data-testid="rum-session-open"
					className="tw:text-primary! tw:hover:underline"
				>
					{shortSessionId(session.id)}
				</Link>
			</TableCell>
			<TableCell className="tw:text-muted-foreground tw:tabular-nums">
				{session.start ? dayjs(session.start).format('HH:mm:ss') : '—'}
			</TableCell>
			<TableCell className={NUMBER}>
				{formatSessionDuration(session.durationMs)}
			</TableCell>
			<TableCell className={NUMBER}>{session.views}</TableCell>
			<TableCell
				className={cn(
					NUMBER,
					errors > 0
						? 'tw:font-semibold tw:text-error-ink'
						: 'tw:text-muted-foreground',
				)}
			>
				{errors}
			</TableCell>
			<TableCell className="tw:max-w-0 tw:truncate" title={session.userAgent}>
				{describeUserAgent(session.userAgent)}
			</TableCell>
			<TableCell className="tw:font-mono tw:text-xs tw:text-muted-foreground">
				{session.release || '—'}
			</TableCell>
			<TableCell className="tw:max-w-0">
				{request ? (
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
						<Link
							to={traceDetailUrl(request.traceId, request.spanId)}
							data-testid="rum-session-trace"
							className="tw:inline-flex tw:items-center tw:gap-1 tw:text-[13px] tw:font-medium tw:text-primary! tw:hover:underline"
						>
							View backend trace
							<ArrowUpRight aria-hidden="true" className="tw:size-3.5" />
						</Link>
						<span
							className={cn(
								'tw:truncate tw:font-mono tw:text-[11px]',
								request.failed ? 'tw:text-error-ink' : 'tw:text-subtle-foreground',
							)}
						>
							{request.label} · {Math.round(request.durationMs)} ms
						</span>
					</span>
				) : (
					<span className="tw:text-xs tw:text-subtle-foreground">
						No backend requests
					</span>
				)}
			</TableCell>
		</TableRow>
	);
}

export default SessionRow;
