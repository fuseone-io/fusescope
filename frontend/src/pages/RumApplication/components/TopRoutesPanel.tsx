import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import RatingChip from 'components/Rum/RatingChip';
import RatingSplitBar from 'components/Rum/RatingSplitBar';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { plural } from 'lib/rum/format';
import { RouteVitals } from 'lib/rum/overviewTypes';
import { VitalName } from 'lib/rum/types';
import { formatVital, rateVital } from 'lib/rum/vitals';
import { cn } from 'lib/utils';

import EmptyRow from './EmptyRow';

interface TopRoutesPanelProps {
	routes: RouteVitals[];
	routeCount: number;
	loading: boolean;
}

const RIGHT = 'tw:text-right tw:tabular-nums';

function ratedClass(vital: VitalName, value: number | undefined): string {
	const rating = value === undefined ? undefined : rateVital(vital, value);
	return cn(
		RIGHT,
		rating === 'needs-improvement' && 'tw:text-warning-ink',
		rating === 'poor' && 'tw:text-error-ink',
	);
}

function TopRoutesPanel({
	routes,
	routeCount,
	loading,
}: TopRoutesPanelProps): JSX.Element {
	return (
		<ContentPanel
			testId="rum-top-routes"
			title="Top routes by LCP"
			subtitle={
				<>
					Routes where pages were loaded, slowest first. In single-page apps, later
					navigations don’t have their own LCP. Routes are templates, so{' '}
					<span className="tw:font-mono">/product/1234</span> counts as{' '}
					<span className="tw:font-mono">/product/:id</span>.
				</>
			}
			actions={
				<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
					{routes.length} of {routeCount} {plural(routeCount, 'route')}
				</span>
			}
			divided
		>
			<div className="tw:overflow-x-auto">
				<Table className="tw:min-w-[900px]">
					<TableHeader>
						<TableRow>
							<TableHead className="tw:w-[28%]">Route</TableHead>
							<TableHead className="tw:text-right">Page loads</TableHead>
							<TableHead>LCP p75</TableHead>
							<TableHead className="tw:w-[18%]">LCP split</TableHead>
							<TableHead className="tw:text-right">INP p75</TableHead>
							<TableHead className="tw:text-right">CLS p75</TableHead>
							<TableHead className="tw:text-right">Errors</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{routes.map((route) => (
							<TableRow key={route.route} data-testid="rum-route-row">
								<TableCell className="tw:max-w-0 tw:truncate tw:font-mono tw:text-xs tw:text-foreground">
									{route.route}
								</TableCell>
								<TableCell className={RIGHT}>{formatCount(route.loads)}</TableCell>
								<TableCell>
									{route.lcp ? (
										<span className="tw:flex tw:items-center tw:gap-2">
											<span className="tw:w-14 tw:tabular-nums">
												{formatVital('lcp', route.lcp.p75)}
											</span>
											<RatingChip vital="lcp" value={route.lcp.p75} />
										</span>
									) : (
										'—'
									)}
								</TableCell>
								<TableCell>
									{route.lcp && (
										<RatingSplitBar
											counts={route.lcp.counts}
											label={`LCP of ${route.route}`}
										/>
									)}
								</TableCell>
								<TableCell className={ratedClass('inp', route.inp)}>
									{route.inp === undefined ? '—' : formatVital('inp', route.inp)}
								</TableCell>
								<TableCell className={ratedClass('cls', route.cls)}>
									{route.cls === undefined ? '—' : formatVital('cls', route.cls)}
								</TableCell>
								<TableCell className={RIGHT}>{formatCount(route.errors)}</TableCell>
							</TableRow>
						))}
						{!loading && routes.length === 0 && (
							<EmptyRow columns={7}>
								No page loads reported Web Vitals in this range.
							</EmptyRow>
						)}
					</TableBody>
				</Table>
			</div>
		</ContentPanel>
	);
}

export default TopRoutesPanel;
