import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { ErrorMessageRow, ExceptionMatch } from 'lib/apm/errors';
import { formatCount } from 'lib/apm/format';
import { cn } from 'lib/utils';

import {
	ERROR_SPANS_FILTER,
	traceFilter,
	useTracesLink,
} from '../../hooks/useTracesLink';

interface ErrorMessagesProps {
	servicename: string;
	rows: ErrorMessageRow[];
	isLoading: boolean;
}

const EXCEPTION_BADGE: Record<
	ExceptionMatch,
	{ tone: StatusTone; label: string }
> = {
	recorded: { tone: 'info', label: 'Recorded' },
	none: { tone: 'warning', label: 'None' },
	unmatched: { tone: 'neutral', label: 'Not matched' },
};

/** Error spans by status message: catches failures that record no exception event. */
function ErrorMessages({
	servicename,
	rows,
	isLoading,
}: ErrorMessagesProps): JSX.Element {
	const tracesLink = useTracesLink(servicename);
	return (
		<ContentPanel
			testId="service-error-messages"
			title="Error status messages"
			subtitle="Spans with error status, grouped by status message. Catches errors that record no exception event."
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[860px] tw:table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[30%]">Status message</TableHead>
							<TableHead>Operation</TableHead>
							<TableHead className="tw:text-right">Spans</TableHead>
							<TableHead className="tw:w-[20%]">Share of errors</TableHead>
							<TableHead>Exception</TableHead>
							<TableHead className="tw:w-28">
								<span className="tw:sr-only">Traces</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell colSpan={6}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						)}
						{!isLoading && rows.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={6}
									className="tw:py-8 tw:text-center tw:text-muted-foreground"
								>
									No spans with error status in this range.
								</TableCell>
							</TableRow>
						)}
						{rows.map((row) => (
							<TableRow key={row.key} data-testid="service-error-message-row">
								<TableCell
									className={cn(
										'tw:truncate tw:font-mono tw:text-[13px]',
										!row.message && 'tw:text-muted-foreground tw:italic',
									)}
								>
									{row.message || '(no status message)'}
								</TableCell>
								<TableCell className="tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground">
									{row.operation}
								</TableCell>
								<TableCell className="tw:text-right tw:font-semibold tw:tabular-nums">
									{formatCount(row.count)}
								</TableCell>
								<TableCell>
									<ShareBar value={row.share} text={`${row.share.toFixed(1)}%`} />
								</TableCell>
								<TableCell>
									<StatusBadge tone={EXCEPTION_BADGE[row.exception].tone}>
										{EXCEPTION_BADGE[row.exception].label}
									</StatusBadge>
								</TableCell>
								<TableCell>
									<Link
										to={tracesLink([
											ERROR_SPANS_FILTER,
											traceFilter('name', [row.operation]),
											...(row.message
												? [traceFilter('status_message', [row.message])]
												: []),
										])}
										className="tw:text-[13px] tw:whitespace-nowrap tw:text-primary! tw:hover:underline"
									>
										View traces
									</Link>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default ErrorMessages;
