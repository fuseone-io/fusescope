import { Link } from 'react-router-dom';
import type { RumtypesRouteSessionDTO } from 'api/generated/services/fuseScope.schemas';
import RatingChip from 'components/Rum/RatingChip';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import dayjs from 'dayjs';
import { clientLabel } from 'lib/rum/client';
import { shortId } from 'lib/rum/format';
import { rumSessionUrl } from 'lib/rum/links';
import { formatVital } from 'lib/rum/vitals';
import { cn } from 'lib/utils';

import EmptyRow from '../../components/EmptyRow';

interface RouteSessionsTableProps {
	applicationId: string;
	sessions: RumtypesRouteSessionDTO[];
}

const LOADING_LABELS: Record<string, string> = {
	initial_load: 'Page load',
	route_change: 'Route change',
	unknown: 'View',
};

function RouteSessionsTable({
	applicationId,
	sessions,
}: RouteSessionsTableProps): JSX.Element {
	return (
		<div className="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-border">
			<Table className="tw:min-w-[600px]">
				<TableHeader>
					<TableRow>
						<TableHead>Session</TableHead>
						<TableHead>Started</TableHead>
						<TableHead>This view</TableHead>
						<TableHead className="tw:text-right">Errors</TableHead>
						<TableHead>Browser · OS</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sessions.map((session) => (
						<TableRow key={session.sessionId} data-testid="rum-route-session">
							<TableCell>
								<Link
									to={rumSessionUrl(applicationId, session.sessionId)}
									title={`session.id ${session.sessionId}`}
									data-testid="rum-route-session-open"
									className="tw:font-mono tw:text-xs tw:text-primary! tw:hover:underline"
								>
									{shortId(session.sessionId)}
								</Link>
							</TableCell>
							<TableCell className="tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums">
								{dayjs(session.startedAt).format('MMM D, HH:mm:ss')}
							</TableCell>
							<TableCell>
								{session.lcpMs === null ? (
									<span className="tw:text-muted-foreground">
										{LOADING_LABELS[session.loadingType] ?? 'View'}
									</span>
								) : (
									<span className="tw:flex tw:items-center tw:gap-2">
										<span className="tw:tabular-nums">
											LCP {formatVital('lcp', session.lcpMs)}
										</span>
										<RatingChip vital="lcp" value={session.lcpMs} />
									</span>
								)}
							</TableCell>
							<TableCell
								className={cn(
									'tw:text-right tw:tabular-nums',
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
						</TableRow>
					))}
					{sessions.length === 0 && (
						<EmptyRow columns={5}>No sessions entered this route.</EmptyRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}

export default RouteSessionsTable;
