import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { Input } from 'components/ui/input';
import ResourceAttributesFilter from 'container/ResourceAttributesFilter';
import { Search, Server } from 'lucide-react';
import { ServicesList as ServicesListType } from 'types/api/metrics/getService';

import { PAGE_SIZE, SEARCH_PLACEHOLDER } from './constants';
import ServicesEmptyState from './ServicesEmptyState';
import ServicesTable from './ServicesTable';
import TrialRpsWarning from './TrialRpsWarning';
import { useServicesTable } from './useServicesTable';

interface ServicesListProps {
	services: ServicesListType[];
	loading: boolean;
	/** Span metrics report p99 in ns; traces in ms. */
	isMetricData: boolean;
}

function ServicesList({
	services,
	loading,
	isMetricData,
}: ServicesListProps): JSX.Element {
	const table = useServicesTable(services);

	let body = (
		<>
			<ServicesTable
				loading={loading}
				rows={table.rows}
				sort={table.sort}
				onSort={table.onSort}
				isMetricData={isMetricData}
			/>
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
		<PageTemplate testId="services-page">
			<PageHeader
				icon={<Server />}
				title="Services"
				badges={
					!loading && (
						<StatusBadge tone="neutral" testId="services-count">
							{services.length}
						</StatusBadge>
					)
				}
				description="RED metrics of every instrumented service in the selected time range"
			/>
			<TrialRpsWarning services={services} />
			<div className="tw:flex tw:flex-wrap tw:items-start tw:gap-2">
				<div className="fs-ui tw:relative tw:w-full tw:font-sans tw:sm:w-64">
					<Search
						aria-hidden="true"
						className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
					/>
					<Input
						type="search"
						data-testid="services-search"
						aria-label={SEARCH_PLACEHOLDER}
						placeholder={SEARCH_PLACEHOLDER}
						value={table.search}
						onChange={(event): void => table.onSearch(event.target.value)}
						className="tw:h-[34px] tw:border-border tw:bg-surface-raised tw:pl-9"
					/>
				</div>
				<div className="tw:min-w-0 tw:flex-1 tw:[&_.resourceAttributesFilter-container]:mb-0!">
					<ResourceAttributesFilter />
				</div>
			</div>
			<Panel testId="services-table" className="tw:overflow-hidden">
				{body}
			</Panel>
		</PageTemplate>
	);
}

export default ServicesList;
