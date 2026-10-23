import { Link, useLocation } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { ApmWindow } from 'lib/apm/window';
import { formatAgo } from 'lib/rum/format';
import { logsExplorerUrl, rumErrorsUrl, rumErrorUrl } from 'lib/rum/links';

import { useErrorGroups } from '../Errors/hooks/useErrorGroups';
import { carriedSearch, errorLogsFilter, recentErrorGroups } from '../utils';
import EmptyRow from './EmptyRow';

interface RecentErrorsPanelProps {
	applicationId: string;
	release: string;
	/** The application (and release) filter of the page. */
	filter: string;
	window: ApmWindow;
}

const LINK =
	'tw:text-[13px] tw:whitespace-nowrap tw:text-primary! tw:hover:underline';
const SECONDARY =
	'tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground! tw:hover:text-foreground! tw:hover:underline';

function RecentErrorsPanel({
	applicationId,
	release,
	filter,
	window,
}: RecentErrorsPanelProps): JSX.Element {
	const { search } = useLocation();
	const { state } = useErrorGroups(applicationId, window, release);
	const errors = state.status === 'ready' ? recentErrorGroups(state.groups) : [];
	const kept = carriedSearch(search);

	return (
		<ContentPanel
			testId="rum-recent-errors"
			title="Recent errors"
			subtitle="JavaScript errors and unhandled rejections grouped by fingerprint, last seen first."
			actions={
				<span className="tw:flex tw:items-center tw:gap-3">
					<Link
						to={logsExplorerUrl(errorLogsFilter(filter), window)}
						className={SECONDARY}
						data-testid="rum-errors-open-logs"
					>
						Open in Logs
					</Link>
					<Link
						to={`${rumErrorsUrl(applicationId)}${kept}`}
						className={LINK}
						data-testid="rum-errors-all"
					>
						All errors
					</Link>
				</span>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[900px]">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[40%]">Error</TableHead>
							<TableHead>Route</TableHead>
							<TableHead className="tw:text-right">Events</TableHead>
							<TableHead className="tw:text-right">Sessions</TableHead>
							<TableHead>Last seen</TableHead>
							<TableHead>
								<span className="tw:sr-only">Links</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{errors.map((error) => (
							<TableRow key={error.fingerprint} data-testid="rum-error-row">
								<TableCell className="tw:max-w-0">
									<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
										<Link
											to={`${rumErrorUrl(applicationId, error.fingerprint)}${kept}`}
											data-testid="rum-error-open"
											className="tw:w-fit tw:font-mono tw:text-xs tw:font-medium tw:text-error-ink! tw:hover:underline"
										>
											{error.type}
										</Link>
										<span
											title={error.message}
											className="tw:truncate tw:text-xs tw:text-muted-foreground"
										>
											{error.message || '—'}
										</span>
									</span>
								</TableCell>
								<TableCell className="tw:font-mono tw:text-xs">
									{error.route || '—'}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatCount(error.events)}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatCount(error.sessions)}
								</TableCell>
								<TableCell className="tw:text-muted-foreground tw:tabular-nums">
									{formatAgo(Date.parse(error.lastSeenAt) || undefined)}
								</TableCell>
								<TableCell className="tw:text-right">
									<Link
										to={logsExplorerUrl(errorLogsFilter(filter, error), window)}
										className={SECONDARY}
										data-testid="rum-error-logs"
									>
										View in Logs
									</Link>
								</TableCell>
							</TableRow>
						))}
						{state.status === 'ready' && errors.length === 0 && (
							<EmptyRow columns={6}>No errors in this range.</EmptyRow>
						)}
						{state.status === 'error' && (
							<EmptyRow columns={6}>Errors could not be loaded.</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default RecentErrorsPanel;
