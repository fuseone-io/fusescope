import { Link } from 'react-router-dom';
import type { RumtypesRequestTemplateStatsDTO } from 'api/generated/services/fuseScope.schemas';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { formatMs } from 'lib/rum/format';
import { traceDetailUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';
import { ArrowUpRight } from 'lucide-react';

import EmptyRow from '../../components/EmptyRow';
import { SLOW_REQUEST_MS } from '../../constants';
import { requestLabel } from '../utils';

interface SlowRequestsTableProps {
	requests: RumtypesRequestTemplateStatsDTO[];
}

const NUMBER = 'tw:text-right tw:tabular-nums';

function SlowRequestsTable({ requests }: SlowRequestsTableProps): JSX.Element {
	return (
		<div className="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-border">
			<Table className="tw:min-w-[640px]">
				<TableHeader>
					<TableRow>
						<TableHead className="tw:w-[42%]">Request</TableHead>
						<TableHead>Backend</TableHead>
						<TableHead className={NUMBER}>p75</TableHead>
						<TableHead className={NUMBER}>Calls</TableHead>
						<TableHead className={NUMBER}>Failed</TableHead>
						<TableHead>
							<span className="tw:sr-only">Trace</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{requests.map((request) => {
						const label = requestLabel(request);
						return (
							<TableRow
								key={`${request.method} ${request.host} ${request.path}`}
								data-testid="rum-route-request"
							>
								<TableCell className="tw:max-w-0">
									<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
										<span title={label} className="tw:truncate tw:font-mono tw:text-xs">
											{label}
										</span>
										{request.host && (
											<span className="tw:truncate tw:text-[11px] tw:text-subtle-foreground">
												{request.host}
											</span>
										)}
									</span>
								</TableCell>
								<TableCell className="tw:font-mono tw:text-xs tw:text-muted-foreground">
									{request.backendService || '—'}
								</TableCell>
								<TableCell
									className={cn(
										NUMBER,
										request.p75Ms >= SLOW_REQUEST_MS && 'tw:text-warning-ink',
									)}
								>
									{formatMs(request.p75Ms)}
								</TableCell>
								<TableCell className={NUMBER}>{formatCount(request.calls)}</TableCell>
								<TableCell
									className={cn(
										NUMBER,
										request.failed > 0 ? 'tw:text-error-ink' : 'tw:text-muted-foreground',
									)}
								>
									{formatCount(request.failed)}
								</TableCell>
								<TableCell className="tw:whitespace-nowrap">
									{request.exampleTraceId ? (
										<Link
											to={traceDetailUrl(request.exampleTraceId)}
											data-testid="rum-route-request-trace"
											className="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary! tw:hover:underline"
										>
											Slowest trace
											<ArrowUpRight aria-hidden="true" className="tw:size-3.5" />
										</Link>
									) : (
										<span className="tw:text-xs tw:text-subtle-foreground">No trace</span>
									)}
								</TableCell>
							</TableRow>
						);
					})}
					{requests.length === 0 && (
						<EmptyRow columns={6}>No fetch or XHR requests on this route.</EmptyRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}

export default SlowRequestsTable;
