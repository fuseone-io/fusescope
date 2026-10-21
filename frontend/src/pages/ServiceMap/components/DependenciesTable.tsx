import { useState } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { cn } from 'lib/utils';
import { ArrowRight } from 'lucide-react';

import { DEPENDENCY_ROWS, PROTOCOL_LABEL } from '../constants';
import { MapEdge } from '../types';
import { HEALTH_LABEL, HEALTH_TONE, nodeHealth } from '../utils/health';
import { worstDependencies } from '../utils/kpis';

interface DependenciesTableProps {
	edges: MapEdge[];
	onSelect: (id: string) => void;
}

const LINK =
	'tw:max-w-[220px] tw:cursor-pointer tw:truncate tw:font-mono tw:text-xs tw:text-primary tw:hover:underline';
const NUMBER = 'tw:text-right tw:font-mono tw:text-xs tw:tabular-nums';

/** Every caller → callee pair in the range, worst first. */
function DependenciesTable({
	edges,
	onSelect,
}: DependenciesTableProps): JSX.Element {
	const [showAll, setShowAll] = useState(false);
	const rows = worstDependencies(edges);
	const visible = showAll ? rows : rows.slice(0, DEPENDENCY_ROWS);

	return (
		<ContentPanel
			testId="service-map-dependencies"
			title="Dependencies"
			subtitle="Every caller → callee pair in the selected time range, worst first"
			actions={
				rows.length > DEPENDENCY_ROWS && (
					<Button
						variant="ghost"
						size="sm"
						onClick={(): void => setShowAll(!showAll)}
						data-testid="service-map-dependencies-all"
					>
						{showAll ? 'Show worst 8' : `View all ${rows.length}`}
					</Button>
				)
			}
			divided
		>
			<Table className="tw:min-w-[900px]">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead>Caller</TableHead>
						<TableHead className="tw:w-5 tw:px-0" aria-label="calls" />
						<TableHead>Callee</TableHead>
						<TableHead>Protocol</TableHead>
						<TableHead className="tw:text-right">Req/s</TableHead>
						<TableHead className="tw:w-48">Error rate</TableHead>
						<TableHead className="tw:text-right">p99</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{visible.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={8}
								className="tw:text-center tw:text-muted-foreground"
							>
								No calls between services in this time range.
							</TableCell>
						</TableRow>
					)}
					{visible.map((edge) => {
						const health = nodeHealth(edge.errorRate, edge.p99);
						return (
							<TableRow
								key={`${edge.source}>${edge.target}`}
								data-testid="service-map-dependency-row"
							>
								<TableCell>
									<button
										type="button"
										className={LINK}
										onClick={(): void => onSelect(edge.source)}
									>
										{edge.source}
									</button>
								</TableCell>
								<TableCell className="tw:px-0 tw:text-subtle-foreground">
									<ArrowRight aria-hidden="true" className="tw:size-4" />
								</TableCell>
								<TableCell>
									<button
										type="button"
										className={LINK}
										onClick={(): void => onSelect(edge.target)}
									>
										{edge.target}
									</button>
								</TableCell>
								<TableCell>
									{edge.protocol ? (
										<span className="tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:font-mono tw:text-[11px] tw:text-muted-foreground">
											{PROTOCOL_LABEL[edge.protocol]}
										</span>
									) : (
										<span className="tw:text-subtle-foreground">—</span>
									)}
								</TableCell>
								<TableCell className={NUMBER}>{formatRate(edge.rate)}</TableCell>
								<TableCell>
									<ShareBar
										value={edge.errorRate}
										tone="error"
										text={formatPercent(edge.errorRate)}
									/>
								</TableCell>
								<TableCell
									className={cn(NUMBER, (edge.p99 ?? 0) >= 2000 && 'tw:text-error')}
								>
									{formatLatencyMs(edge.p99)}
								</TableCell>
								<TableCell>
									<StatusBadge tone={HEALTH_TONE[health]} dot>
										{HEALTH_LABEL[health]}
									</StatusBadge>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</ContentPanel>
	);
}

export default DependenciesTable;
