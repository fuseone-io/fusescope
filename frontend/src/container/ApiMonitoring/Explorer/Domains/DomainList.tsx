import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { SortState } from 'components/PageTemplate/types';
import QueryCancelledPlaceholder from 'components/QueryCancelledPlaceholder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';

import { DomainSortKey, sortDomains } from '../../domainList';
import { DOMAINS_DEFAULT_QUERY } from './List/constants';
import DomainsEmptyState from './List/DomainsEmptyState';
import DomainsTable from './List/DomainsTable';
import DomainsToolbar from './List/DomainsToolbar';
import { useDomainCallers } from './List/useDomainCallers';
import { useDomainList } from './List/useDomainList';

const DEFAULT_SORT: SortState<DomainSortKey> = {
	key: 'errorRate',
	direction: 'desc',
};

function DomainList(): JSX.Element {
	const queryClient = useQueryClient();
	const { currentQuery, handleRunQuery, redirectWithQueryBuilderData } =
		useQueryBuilder();
	const { rows, filterExpression, isLoading, isFetching, isError } =
		useDomainList();
	const callers = useDomainCallers(filterExpression);
	const [isCancelled, setIsCancelled] = useState(false);
	const [search, setSearch] = useState('');
	const [sort, setSort] = useState<SortState<DomainSortKey>>(DEFAULT_SORT);

	useShareBuilderUrl({ defaultValue: DOMAINS_DEFAULT_QUERY });

	const handleCancelQuery = useCallback(() => {
		queryClient.cancelQueries([REACT_QUERY_KEY.GET_DOMAINS_LIST]);
		setIsCancelled(true);
	}, [queryClient]);

	const handleStageAndRunQuery = useCallback(() => {
		setIsCancelled(false);
		queryClient.invalidateQueries([REACT_QUERY_KEY.GET_DOMAINS_LIST]);
		handleRunQuery();
	}, [queryClient, handleRunQuery]);

	useEffect(() => {
		if (isFetching) {
			setIsCancelled(false);
		}
	}, [isFetching]);

	const handleSort = (key: DomainSortKey): void =>
		setSort((current) => ({
			key,
			direction:
				current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
		}));

	const visibleRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		const matching = term
			? rows.filter((row) => row.domain.toLowerCase().includes(term))
			: rows;
		return sortDomains(matching, sort);
	}, [rows, search, sort]);

	const isFiltered = Boolean(filterExpression.trim()) || Boolean(search.trim());
	const clearFilters = (): void => {
		setSearch('');
		const [first, ...others] = currentQuery.builder.queryData;
		redirectWithQueryBuilderData({
			...currentQuery,
			builder: {
				...currentQuery.builder,
				queryData: [
					{
						...first,
						filter: { expression: '' },
						filters: { op: 'AND', items: [] },
					},
					...others,
				],
			},
		});
	};

	const loading = isLoading || isFetching;
	const noDomains = !loading && !isCancelled && rows.length === 0;

	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6">
			<DomainsToolbar
				search={search}
				onSearch={setSearch}
				isFetching={isFetching}
				onRunQuery={handleStageAndRunQuery}
				onCancelQuery={handleCancelQuery}
			/>
			{isCancelled && rows.length === 0 && (
				<QueryCancelledPlaceholder subText='Click "Run Query" to load API monitoring data.' />
			)}
			{noDomains && (
				<DomainsEmptyState onClearFilters={isFiltered ? clearFilters : undefined} />
			)}
			{!noDomains && !(isCancelled && rows.length === 0) && (
				<ContentPanel
					testId="api-monitoring-domains-table"
					title="Domains"
					subtitle="HTTP calls from spans with kind Client, grouped by the host in url.full or http.url."
					divided
					footer={
						<>
							<span className="tw:tabular-nums">
								{visibleRows.length} of {rows.length} domains
							</span>
							<span>Error % is the share of calls whose span status is Error</span>
						</>
					}
				>
					{isError && !loading ? (
						<p className="fs-ui tw:px-5 tw:py-10 tw:text-center tw:font-sans tw:text-[13px] tw:text-muted-foreground">
							The domains could not be loaded. Run the query again.
						</p>
					) : (
						<DomainsTable
							rows={visibleRows}
							loading={loading}
							callers={callers}
							sort={sort}
							onSort={handleSort}
						/>
					)}
					{!loading && rows.length > 0 && visibleRows.length === 0 && (
						<p className="fs-ui tw:px-5 tw:py-10 tw:text-center tw:font-sans tw:text-[13px] tw:text-muted-foreground">
							No domains match “{search.trim()}”.
						</p>
					)}
				</ContentPanel>
			)}
		</div>
	);
}

export default DomainList;
