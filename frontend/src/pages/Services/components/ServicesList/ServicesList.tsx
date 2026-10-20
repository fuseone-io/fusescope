import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { Info, Network, Server } from 'lucide-react';
import { ServicesList as ServicesListType } from 'types/api/metrics/getService';

import { PAGE_SIZE } from './constants';
import { buildServiceRows } from './serviceRows';
import ServicesEmptyState from './ServicesEmptyState';
import ServicesFilterRow from './ServicesFilterRow';
import ServicesTable from './ServicesTable';
import TrialRpsWarning from './TrialRpsWarning';
import { useServicesApm } from './useServicesApm';
import { useServicesTable } from './useServicesTable';

interface ServicesListProps {
	services: ServicesListType[];
	loading: boolean;
	/** Span metrics report p99 in ms; traces in ns. */
	isMetricData: boolean;
	/** Span metrics only: scopes the period comparison to top-level operations. */
	topLevelOperations?: [string, string[]][];
}

function ServicesList({
	services,
	loading,
	isMetricData,
	topLevelOperations,
}: ServicesListProps): JSX.Element {
	const { stats } = useServicesApm(
		isMetricData ? 'span-metrics' : 'traces',
		topLevelOperations,
	);
	const rows = useMemo(
		() => buildServiceRows(services, stats, isMetricData),
		[services, stats, isMetricData],
	);
	const flagged = rows.filter((row) => row.badges.length > 0).length;
	const table = useServicesTable(rows);

	let body = (
		<>
			<div className="tw:overflow-x-auto">
				<ServicesTable
					loading={loading}
					rows={table.rows}
					sort={table.sort}
					onSort={table.onSort}
				/>
			</div>
			<TablePagination
				page={table.page}
				pageSize={PAGE_SIZE}
				total={table.total}
				onPageChange={table.setPage}
			/>
		</>
	);
	if (!loading && table.total === 0) {
		body = <ServicesEmptyState searching={table.search.trim() !== ''} />;
	}

	return (
		<HeaderBandLayout
			testId="services-page"
			header={
				<CompactPageHeader
					icon={<Server />}
					title="Services"
					meta={
						!loading && (
							<>
								<strong
									data-testid="services-count"
									className="tw:font-medium tw:text-foreground"
								>
									{services.length}
								</strong>{' '}
								services in the selected range ·{' '}
								<strong
									data-testid="services-flagged-count"
									className="tw:font-medium tw:text-foreground"
								>
									{flagged}
								</strong>{' '}
								with highlights
							</>
						)
					}
					actions={
						<Button asChild variant="outline">
							<Link to={ROUTES.SERVICE_MAP} data-testid="services-open-map">
								<Network aria-hidden="true" />
								Service map
							</Link>
						</Button>
					}
				/>
			}
			bodyClassName="tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6"
		>
			<TrialRpsWarning services={services} />
			<ServicesFilterRow search={table.search} onSearch={table.onSearch} />
			<ContentPanel
				testId="services-table"
				title="Services"
				subtitle="Entry-point spans per service. Deltas compare with the previous period of the same length."
				actions={
					<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
						<Info aria-hidden="true" className="tw:size-3.5" />
						Highlights flag a 2× change or an error rate of 50% or more
					</span>
				}
				divided
			>
				{body}
			</ContentPanel>
		</HeaderBandLayout>
	);
}

export default ServicesList;
