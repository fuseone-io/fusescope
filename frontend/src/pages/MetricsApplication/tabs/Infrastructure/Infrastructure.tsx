import { Link } from 'react-router-dom';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import ShareBar from 'components/PageTemplate/components/ShareBar';
import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
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
import { useServiceResources } from 'container/MetricsApplication/hooks/useServiceResources';
import dayjs from 'dayjs';
import {
	formatCount,
	formatLatencyMs,
	formatPercent,
	formatRate,
} from 'lib/apm/format';
import { cn } from 'lib/utils';
import { ArrowRight, Info } from 'lucide-react';

import { traceFilter, useTracesLink } from '../../hooks/useTracesLink';

interface InfrastructureProps {
	servicename: string;
}

const LINK = 'tw:text-[13px] tw:text-primary! tw:hover:underline';

/** The hosts behind the service's requests, from `host.name` on its spans. */
function Infrastructure({ servicename }: InfrastructureProps): JSX.Element {
	const { hosts, isLoading } = useServiceResources(servicename);
	const tracesLink = useTracesLink(servicename);
	return (
		<ContentPanel
			testId="service-hosts"
			title={
				<>
					Hosts
					<TabCountBadge count={isLoading ? undefined : hosts.length} />
				</>
			}
			subtitle={
				<>
					Values of <span className="tw:font-mono">host.name</span> on{' '}
					<span className="tw:font-mono">{servicename}</span> requests, with the
					traffic each one served
				</>
			}
			actions={
				<Button asChild variant="ghost" size="sm">
					<Link to={ROUTES.INFRASTRUCTURE_MONITORING_HOSTS}>
						Open Infrastructure
						<ArrowRight aria-hidden="true" />
					</Link>
				</Button>
			}
			footer={
				<span className="tw:flex tw:items-center tw:gap-2">
					<Info aria-hidden="true" className="tw:size-3.5" />
					CPU and memory per host appear in Infrastructure once the collector sends
					host metrics.
				</span>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[1040px] tw:table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[20%]">host.name</TableHead>
							<TableHead className="tw:text-right">Requests</TableHead>
							<TableHead className="tw:text-right">Rate</TableHead>
							<TableHead className="tw:text-right">Error %</TableHead>
							<TableHead className="tw:text-right">p99</TableHead>
							<TableHead className="tw:w-[18%]">Share of traffic</TableHead>
							<TableHead>Last seen</TableHead>
							<TableHead className="tw:w-32">
								<span className="tw:sr-only">Links</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell colSpan={8}>
									<Skeleton className="tw:h-5 tw:bg-muted" />
								</TableCell>
							</TableRow>
						)}
						{!isLoading && hosts.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={8}
									className="tw:py-8 tw:text-center tw:whitespace-normal tw:text-muted-foreground"
								>
									No span of this service carries{' '}
									<span className="tw:font-mono">host.name</span> in this range.
								</TableCell>
							</TableRow>
						)}
						{hosts.map((host) => (
							<TableRow key={host.name} data-testid="service-host-row">
								<TableCell className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium">
									{host.name}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatCount(host.requests)}
								</TableCell>
								<TableCell className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
									{formatRate(host.rate)}
								</TableCell>
								<TableCell
									className={cn(
										'tw:text-right tw:tabular-nums',
										host.errorRate >= 5 && 'tw:font-semibold tw:text-error-ink',
									)}
								>
									{formatPercent(host.errorRate)}
								</TableCell>
								<TableCell className="tw:text-right tw:tabular-nums">
									{formatLatencyMs(host.p99)}
								</TableCell>
								<TableCell>
									<ShareBar value={host.share} text={`${host.share.toFixed(0)}%`} />
								</TableCell>
								<TableCell className="tw:text-muted-foreground tw:tabular-nums">
									{host.lastSeen ? dayjs(host.lastSeen).format('HH:mm:ss') : '—'}
								</TableCell>
								<TableCell>
									<span className="tw:flex tw:gap-3">
										<Link
											to={tracesLink([
												traceFilter('host.name', [host.name], undefined, 'resource'),
											])}
											className={LINK}
										>
											Traces
										</Link>
										<Link to={ROUTES.INFRASTRUCTURE_MONITORING_HOSTS} className={LINK}>
											Host
										</Link>
									</span>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default Infrastructure;
