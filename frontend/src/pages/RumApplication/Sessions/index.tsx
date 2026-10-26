import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import NumberedTablePagination from 'components/PageTemplate/components/NumberedTablePagination';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { ApmWindow } from 'lib/apm/window';
import { clientColumnLabel } from 'lib/rum/client';
import { plural } from 'lib/rum/format';

import EmptyRow from '../components/EmptyRow';
import { useApplicationPlatform } from '../hooks/useApplicationPlatform';
import SessionListRow from './components/SessionListRow';
import { PAGE_SIZES } from './constants';
import { useSessionFilters } from './hooks/useSessionFilters';
import { useSessionsQuery } from './hooks/useSessionsQuery';

interface SessionsTabProps {
	applicationId: string;
	release: string;
	window: ApmWindow;
}

const RIGHT = 'tw:text-right';

function SessionsTab({
	applicationId,
	release,
	window,
}: SessionsTabProps): JSX.Element {
	const [filters, update] = useSessionFilters();
	const state = useSessionsQuery(applicationId, filters, window, release);
	const platform = useApplicationPlatform(applicationId);
	const total = state.status === 'ready' ? state.total : 0;

	return (
		<ContentPanel
			testId="rum-sessions"
			title="Sessions"
			subtitle={
				<>
					A session ends after 15 min idle or 4 h; the next one carries{' '}
					<span className="tw:font-mono">session.previous_id</span>.
				</>
			}
			actions={
				state.status === 'ready' && (
					<span
						data-testid="rum-sessions-total"
						className="tw:text-xs tw:text-muted-foreground tw:tabular-nums"
					>
						{formatCount(total)} {plural(total, 'session')} · newest first
					</span>
				)
			}
			footer={
				total > 0 && (
					<NumberedTablePagination
						page={filters.page}
						pageSize={filters.pageSize}
						total={total}
						itemLabel="sessions"
						pageSizes={PAGE_SIZES}
						onChange={(page, pageSize): void => update({ page, pageSize })}
						className="tw:w-full"
					/>
				)
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[1080px]">
					<TableHeader>
						<TableRow>
							<TableHead>Session</TableHead>
							<TableHead>User</TableHead>
							<TableHead>Started</TableHead>
							<TableHead className={RIGHT}>Duration</TableHead>
							<TableHead className={RIGHT}>Views</TableHead>
							<TableHead className={RIGHT}>Actions</TableHead>
							<TableHead className={RIGHT}>Errors</TableHead>
							<TableHead>{clientColumnLabel(platform)}</TableHead>
							<TableHead>Release</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{state.status === 'ready' &&
							state.sessions.map((session) => (
								<SessionListRow
									key={session.sessionId}
									applicationId={applicationId}
									session={session}
								/>
							))}
						{state.status === 'loading' && (
							<EmptyRow columns={9}>Loading sessions…</EmptyRow>
						)}
						{state.status === 'error' && (
							<EmptyRow columns={9}>Sessions could not be loaded.</EmptyRow>
						)}
						{state.status === 'ready' && state.sessions.length === 0 && (
							<EmptyRow columns={9}>
								<span data-testid="rum-sessions-empty">
									No sessions match these filters in this range.
								</span>
							</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default SessionsTab;
