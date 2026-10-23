import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { ApmWindow } from 'lib/apm/window';
import { plural } from 'lib/rum/format';

import EmptyRow from '../components/EmptyRow';
import ErrorGroupRow from './components/ErrorGroupRow';
import { useErrorFilters } from './hooks/useErrorFilters';
import { useErrorGroups } from './hooks/useErrorGroups';
import { filterGroups, sourceMapMissing } from './utils';

interface ErrorsTabProps {
	applicationId: string;
	release: string;
	window: ApmWindow;
}

const RIGHT = 'tw:text-right';
const COLUMNS = 7;

function ErrorsTab({
	applicationId,
	release,
	window,
}: ErrorsTabProps): JSX.Element {
	const [filters] = useErrorFilters();
	const { state, uploadedReleases } = useErrorGroups(
		applicationId,
		window,
		release,
	);
	const groups =
		state.status === 'ready' ? filterGroups(state.groups, filters) : [];
	const events = groups.reduce((sum, group) => sum + group.events, 0);

	return (
		<ContentPanel
			testId="rum-errors"
			title="Error groups"
			subtitle="Grouped by fingerprint: exception type, normalized message and the top frame’s file and function, so one bug lands in one group across browsers."
			actions={
				state.status === 'ready' && (
					<span
						data-testid="rum-errors-total"
						className="tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums"
					>
						{formatCount(groups.length)} {plural(groups.length, 'group')} ·{' '}
						{formatCount(events)} {plural(events, 'event')}
					</span>
				)
			}
			footer={
				state.status === 'ready' &&
				state.total > state.groups.length && (
					<span className="tw:text-xs tw:text-subtle-foreground">
						The {formatCount(state.groups.length)} groups with the most events of{' '}
						{formatCount(state.total)}; narrow the range or release for the rest.
					</span>
				)
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[1020px]">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[44%]">Error</TableHead>
							<TableHead>Trend</TableHead>
							<TableHead className={RIGHT}>Events</TableHead>
							<TableHead className={RIGHT}>Sessions</TableHead>
							<TableHead>Releases</TableHead>
							<TableHead>First seen</TableHead>
							<TableHead>Last seen</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{state.status === 'ready' &&
							groups.map((group) => (
								<ErrorGroupRow
									key={group.fingerprint}
									applicationId={applicationId}
									group={group}
									totalSessions={state.sessions}
									sourceMapMissing={sourceMapMissing(group, uploadedReleases)}
								/>
							))}
						{state.status === 'loading' && (
							<EmptyRow columns={COLUMNS}>Loading errors…</EmptyRow>
						)}
						{state.status === 'error' && (
							<EmptyRow columns={COLUMNS}>Errors could not be loaded.</EmptyRow>
						)}
						{state.status === 'ready' && groups.length === 0 && (
							<EmptyRow columns={COLUMNS}>
								<span data-testid="rum-errors-empty">
									{state.groups.length === 0
										? 'No errors in this range.'
										: 'No error groups match these filters.'}
								</span>
							</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default ErrorsTab;
