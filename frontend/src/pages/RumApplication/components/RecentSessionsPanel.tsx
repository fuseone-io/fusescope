import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { ApmWindow } from 'lib/apm/window';
import { tracesExplorerUrl } from 'lib/rum/links';
import { SessionRequest, SessionSummary } from 'lib/rum/overviewTypes';

import { sessionsTracesFilter } from '../utils';
import EmptyRow from './EmptyRow';
import SessionRow from './SessionRow';

interface RecentSessionsPanelProps {
	sessions: SessionSummary[];
	errors: Record<string, number>;
	requests: Record<string, SessionRequest>;
	filter: string;
	window: ApmWindow;
	loading: boolean;
}

function RecentSessionsPanel({
	sessions,
	errors,
	requests,
	filter,
	window,
	loading,
}: RecentSessionsPanelProps): JSX.Element {
	const ids = sessions.map((session) => session.id);
	return (
		<ContentPanel
			testId="rum-recent-sessions"
			title="Recent sessions"
			subtitle={
				<>
					Each browser request carries{' '}
					<span className="tw:font-mono">traceparent</span>, so its backend trace
					opens in one click.
				</>
			}
			actions={
				<span className="tw:text-xs tw:text-muted-foreground">
					Latest {sessions.length} · full list and timeline come with Sessions
				</span>
			}
			footer={
				<span className="tw:flex tw:w-full tw:flex-wrap tw:justify-between tw:gap-2">
					<span>
						Shows the slowest or failing request of each session.{' '}
						{ids.length > 0 && (
							<Link
								to={tracesExplorerUrl(sessionsTracesFilter(filter, ids), window)}
								className="tw:text-primary! tw:underline! tw:underline-offset-2"
								data-testid="rum-sessions-traces"
							>
								All traces for these sessions
							</Link>
						)}
					</span>
				</span>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[1000px]">
					<TableHeader>
						<TableRow>
							<TableHead>Session</TableHead>
							<TableHead>Started</TableHead>
							<TableHead className="tw:text-right">Duration</TableHead>
							<TableHead className="tw:text-right">Views</TableHead>
							<TableHead className="tw:text-right">Errors</TableHead>
							<TableHead>Browser · OS</TableHead>
							<TableHead>Release</TableHead>
							<TableHead className="tw:w-[24%]">Backend trace</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sessions.map((session) => (
							<SessionRow
								key={session.id}
								session={session}
								errors={errors[session.id] ?? 0}
								request={requests[session.id]}
							/>
						))}
						{!loading && sessions.length === 0 && (
							<EmptyRow columns={8}>No sessions in this range.</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default RecentSessionsPanel;
