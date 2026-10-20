import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
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
import { EndpointRow } from 'lib/apm/endpoints';
import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';
import { ArrowRight } from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';

interface TopEndpointsProps {
	rows: EndpointRow[];
	isLoading: boolean;
	onOpen: (operation: string, openInNewTab: boolean) => void;
	onShowAll: () => void;
}

const TOP = 5;

/** The five operations taking the most time; the Endpoints tab has them all. */
function TopEndpoints({
	rows,
	isLoading,
	onOpen,
	onShowAll,
}: TopEndpointsProps): JSX.Element {
	const top = [...rows].sort((a, b) => b.share - a.share).slice(0, TOP);
	return (
		<ContentPanel
			testId="service-top-endpoints"
			title="Top endpoints"
			subtitle="The five operations taking the most time. The Endpoints tab has the full table."
			actions={
				<Button
					variant="ghost"
					size="sm"
					onClick={onShowAll}
					data-testid="service-all-endpoints"
				>
					All endpoints
					<ArrowRight aria-hidden="true" />
				</Button>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[720px]">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[40%]">Operation</TableHead>
							<TableHead className="tw:text-right">Rate</TableHead>
							<TableHead className="tw:text-right">p99</TableHead>
							<TableHead className="tw:text-right">Error %</TableHead>
							<TableHead className="tw:w-[24%]">% time spent</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell colSpan={5}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						)}
						{!isLoading && top.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="tw:py-8 tw:text-center tw:text-muted-foreground"
								>
									No operations in this range.
								</TableCell>
							</TableRow>
						)}
						{top.map((row) => (
							<TableRow
								key={row.key}
								data-testid="top-endpoint-row"
								className="tw:cursor-pointer"
								onClick={(event): void => onOpen(row.name, isModifierKeyPressed(event))}
							>
								<TableCell className="tw:max-w-0 tw:truncate tw:font-mono tw:text-xs">
									{row.name}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatRate(row.rate)}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatLatencyMs(row.p99)}
								</TableCell>
								<TableCell
									className={cn(
										'tw:text-right tw:tabular-nums',
										row.errorRate >= 5 && 'tw:font-semibold tw:text-error-ink',
									)}
								>
									{formatPercent(row.errorRate)}
								</TableCell>
								<TableCell>
									<ShareBar value={row.share} text={`${row.share.toFixed(1)}%`} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default TopEndpoints;
