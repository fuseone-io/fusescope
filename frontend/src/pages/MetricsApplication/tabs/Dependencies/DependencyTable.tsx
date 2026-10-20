import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
import { Skeleton } from 'components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { Dependency } from 'lib/apm/dependencies';
import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { ChevronRight } from 'lucide-react';

import ServiceKindIcon from 'components/ServiceKindIcon/ServiceKindIcon';

import DependencyKindBadge from './DependencyKindBadge';
import { useDependencyKind } from './useDependencyKind';

interface DependencyTableProps {
	title: string;
	subtitle: ReactNode;
	nameLabel: string;
	rows: Dependency[];
	isLoading: boolean;
	linkFor: (dependency: Dependency) => string;
	empty: ReactNode;
	testId: string;
}

/** Dependencies with their type, rate, latency and error share. */
function DependencyTable({
	title,
	subtitle,
	nameLabel,
	rows,
	isLoading,
	linkFor,
	empty,
	testId,
}: DependencyTableProps): JSX.Element {
	const kindOf = useDependencyKind();
	return (
		<ContentPanel
			testId={testId}
			title={
				<>
					{title}
					<TabCountBadge count={isLoading ? undefined : rows.length} />
				</>
			}
			subtitle={subtitle}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[900px] tw:table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[28%]">{nameLabel}</TableHead>
							<TableHead>Type</TableHead>
							<TableHead className="tw:text-right">Rate</TableHead>
							<TableHead className="tw:text-right">p50</TableHead>
							<TableHead className="tw:text-right">p99</TableHead>
							<TableHead className="tw:w-[22%]">Error %</TableHead>
							<TableHead className="tw:w-10">
								<span className="tw:sr-only">Open</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell colSpan={7}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						)}
						{!isLoading && rows.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={7}
									className="tw:py-8 tw:text-center tw:whitespace-normal"
								>
									{empty}
								</TableCell>
							</TableRow>
						)}
						{!isLoading &&
							rows.map((row) => (
								<TableRow key={`${row.kind}-${row.name}`} data-testid="dependency-row">
									<TableCell className="tw:truncate">
										<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
											<ServiceKindIcon kind={kindOf(row)} />
											<Link
												to={linkFor(row)}
												className="tw:font-mono tw:text-[13px] tw:text-primary! tw:hover:underline"
											>
												{row.name}
											</Link>
										</span>
									</TableCell>
									<TableCell>
										<DependencyKindBadge kind={row.kind} />
									</TableCell>
									<TableCell className="tw:text-right tw:tabular-nums">
										{formatRate(row.rate)}
									</TableCell>
									<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
										{formatLatencyMs(row.p50)}
									</TableCell>
									<TableCell className="tw:text-right tw:tabular-nums">
										{formatLatencyMs(row.p99)}
									</TableCell>
									<TableCell>
										<ShareBar
											value={row.errorRate > 0 ? Math.max(row.errorRate, 1) : 0}
											tone="error"
											text={formatPercent(row.errorRate)}
										/>
									</TableCell>
									<TableCell>
										<ChevronRight
											aria-hidden="true"
											className="tw:size-4 tw:text-subtle-foreground"
										/>
									</TableCell>
								</TableRow>
							))}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default DependencyTable;
