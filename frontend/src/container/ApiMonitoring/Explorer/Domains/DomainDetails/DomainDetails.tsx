import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandTabsLayout from 'components/PageTemplate/components/HeaderBandTabsLayout';
import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { AlertTriangle, Globe, LayoutDashboard, ListTree } from 'lucide-react';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

import { DomainTab, domainTabOfSearch, viewOfTab } from '../../../domainRoute';
import { useApiMonitoringParams } from '../../../queryParams';
import { useDomainCallers } from '../List/useDomainCallers';
import { useDomainList } from '../List/useDomainList';
import AllEndPoints from './AllEndPoints';
import DomainMetrics from './components/DomainMetrics';
import DomainNavigation from './DomainNavigation';
import EndPointDetails from './EndPointDetails';
import TopErrors from './TopErrors';
import { useDomainTimeRange } from './useDomainTimeRange';
import { VIEWS } from './constants';

const EMPTY_FILTERS: IBuilderQuery['filters'] = { items: [], op: 'AND' };

const TabLabel = ({
	icon,
	children,
}: {
	icon: JSX.Element;
	children: string;
}): JSX.Element => (
	<>
		<span aria-hidden="true" className="tw:inline-flex tw:[&_svg]:size-4">
			{icon}
		</span>
		{children}
	</>
);

/** A domain's page, remounted per domain: header with its numbers, then Overview, Endpoints and Top errors. */
function DomainDetails({ domain }: { domain: string }): JSX.Element {
	const { search } = useLocation();
	const [params, setParams] = useApiMonitoringParams();
	const tab = domainTabOfSearch(search);
	const selectedEndPointName = params.selectedEndPointName || '';
	const { timeRange, handleTimeChange } = useDomainTimeRange();

	const compositeData = useGetCompositeQueryParam();
	const domainListFilters = useMemo(
		() => compositeData?.builder?.queryData[0]?.filters ?? EMPTY_FILTERS,
		[compositeData],
	);
	const [endPointsGroupBy, setEndPointsGroupBy] = useState<
		IBuilderQuery['groupBy']
	>([]);
	const [initialFiltersEndPointStats, setInitialFiltersEndPointStats] =
		useState<IBuilderQuery['filters']>(domainListFilters);

	const { rows, filterExpression } = useDomainList();
	const callers = useDomainCallers(filterExpression).get(domain);
	const endpointCount = rows.find((row) => row.domain === domain)?.endpoints;

	const setTab = (value: string): void =>
		setParams({ selectedView: viewOfTab(value as DomainTab) });
	const setSelectedView = (view: VIEWS): void =>
		setParams({ selectedView: view });
	const handleEndPointChange = (name: string): void =>
		setParams({ selectedEndPointName: name });

	return (
		<HeaderBandTabsLayout
			testId="api-monitoring-domain-page"
			label="Domain sections"
			value={tab}
			onValueChange={setTab}
			header={
				<CompactPageHeader
					icon={<Globe />}
					title={domain}
					titleMono
					meta={
						<DomainMetrics
							domainName={domain}
							domainListFilters={domainListFilters}
							timeRange={timeRange}
							callers={callers}
						/>
					}
					actions={<DomainNavigation domain={domain} rows={rows} />}
				/>
			}
			tabs={[
				{
					value: DomainTab.Overview,
					label: <TabLabel icon={<LayoutDashboard />}>Overview</TabLabel>,
					content: (
						<EndPointDetails
							domainName={domain}
							endPointName={selectedEndPointName}
							setSelectedEndPointName={handleEndPointChange}
							initialFilters={initialFiltersEndPointStats}
							timeRange={timeRange}
							handleTimeChange={handleTimeChange}
							endpointCount={endpointCount}
						/>
					),
				},
				{
					value: DomainTab.Endpoints,
					label: <TabLabel icon={<ListTree />}>Endpoints</TabLabel>,
					badge: <TabCountBadge count={endpointCount} />,
					content: (
						<AllEndPoints
							domainName={domain}
							setSelectedEndPointName={handleEndPointChange}
							setSelectedView={setSelectedView}
							groupBy={endPointsGroupBy}
							setGroupBy={setEndPointsGroupBy}
							timeRange={timeRange}
							initialFilters={domainListFilters}
							setInitialFiltersEndPointStats={setInitialFiltersEndPointStats}
						/>
					),
				},
				{
					value: DomainTab.Errors,
					label: <TabLabel icon={<AlertTriangle />}>Top errors</TabLabel>,
					content: (
						<TopErrors
							domainName={domain}
							timeRange={timeRange}
							initialFilters={domainListFilters}
						/>
					),
				},
			]}
		/>
	);
}

export default DomainDetails;
