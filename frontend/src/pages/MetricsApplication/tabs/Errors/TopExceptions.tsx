import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import ROUTES from 'constants/routes';
import { getNanoSeconds } from 'container/AllError/utils';
import dayjs from 'dayjs';
import { formatCount } from 'lib/apm/format';
import { ArrowRight } from 'lucide-react';
import { Exception } from 'types/api/errors/getAll';

interface TopExceptionsProps {
	servicename: string;
	exceptions: Exception[];
	isLoading: boolean;
}

const when = (date: string): string => dayjs(date).format('MMM D, HH:mm:ss');

/** The service's most frequent exception groups, linked to their detail in Exceptions. */
function TopExceptions({
	servicename,
	exceptions,
	isLoading,
}: TopExceptionsProps): JSX.Element {
	return (
		<ContentPanel
			testId="service-top-exceptions"
			title="Top exceptions"
			subtitle={
				<>
					Exception events recorded on{' '}
					<span className="tw:font-mono">{servicename}</span> spans, grouped by type
					and message
				</>
			}
			actions={
				<Button asChild variant="ghost" size="sm">
					<Link to={ROUTES.ALL_ERROR}>
						All in Exceptions
						<ArrowRight aria-hidden="true" />
					</Link>
				</Button>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[820px] tw:table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[46%]">Exception</TableHead>
							<TableHead className="tw:text-right">Count</TableHead>
							<TableHead>Last seen</TableHead>
							<TableHead>First seen</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell colSpan={4}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						)}
						{!isLoading && exceptions.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={4}
									className="tw:py-8 tw:text-center tw:text-muted-foreground"
								>
									No exception events in this range.
								</TableCell>
							</TableRow>
						)}
						{exceptions.map((item) => (
							<TableRow key={item.groupID} data-testid="service-exception-row">
								<TableCell className="tw:whitespace-normal">
									<Link
										to={`${ROUTES.ERROR_DETAIL}?groupId=${item.groupID}&timestamp=${getNanoSeconds(item.lastSeen)}`}
										className="tw:block tw:truncate tw:font-mono tw:text-[13px] tw:text-primary! tw:hover:underline"
									>
										{item.exceptionType}
									</Link>
									<span className="tw:block tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground">
										{item.exceptionMessage}
									</span>
								</TableCell>
								<TableCell className="tw:text-right tw:font-semibold tw:tabular-nums">
									{formatCount(item.exceptionCount)}
								</TableCell>
								<TableCell className="tw:text-muted-foreground tw:tabular-nums">
									{when(item.lastSeen)}
								</TableCell>
								<TableCell className="tw:text-muted-foreground tw:tabular-nums">
									{when(item.firstSeen)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default TopExceptions;
