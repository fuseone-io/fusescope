import { Link } from 'react-router-dom';
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
import { logsExplorerUrl } from 'lib/rum/links';
import { ErrorGroup } from 'lib/rum/overviewTypes';

import { errorLogsFilter } from '../utils';
import EmptyRow from './EmptyRow';

interface RecentErrorsPanelProps {
	errors: ErrorGroup[];
	/** The application (and release) filter of the page. */
	filter: string;
	window: ApmWindow;
	loading: boolean;
}

const LINK =
	'tw:text-[13px] tw:whitespace-nowrap tw:text-primary! tw:hover:underline';

function RecentErrorsPanel({
	errors,
	filter,
	window,
	loading,
}: RecentErrorsPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId="rum-recent-errors"
			title="Recent errors"
			subtitle="JavaScript errors and unhandled rejections, grouped by type and message. Stack traces are not symbolicated yet."
			actions={
				<Link
					to={logsExplorerUrl(errorLogsFilter(filter), window)}
					className={LINK}
					data-testid="rum-errors-open-logs"
				>
					Open in Logs
				</Link>
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
							<TableRow
								key={`${error.type}|${error.message}|${error.route}`}
								data-testid="rum-error-row"
							>
								<TableCell className="tw:max-w-0">
									<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
										<span className="tw:font-mono tw:text-xs tw:font-medium tw:text-error-ink">
											{error.type}
										</span>
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
									{formatAgo(error.lastSeen)}
								</TableCell>
								<TableCell>
									<Link
										to={logsExplorerUrl(errorLogsFilter(filter, error), window)}
										className={LINK}
										data-testid="rum-error-logs"
									>
										View in Logs
									</Link>
								</TableCell>
							</TableRow>
						))}
						{!loading && errors.length === 0 && (
							<EmptyRow columns={6}>No errors in this range.</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default RecentErrorsPanel;
