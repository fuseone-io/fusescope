import { useCallback, useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import QuerySearch from 'components/QueryBuilderV2/QueryV2/QuerySearch/QuerySearch';
import { Input } from 'components/ui/input';
import { Switch } from 'components/ui/switch';
import RightToolbarActions from 'container/QueryBuilder/components/ToolbarActions/RightToolbarActions';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { Search } from 'lucide-react';
import { HandleChangeQueryDataV5 } from 'types/common/operations.types';
import { DataSource } from 'types/common/queryBuilder';

import { ApiMonitoringHardcodedAttributeKeys } from '../../../constants';
import { selectedFilterValue, withFilterValue } from '../../../filterSelect';
import { useApiMonitoringParams } from '../../../queryParams';
import FilterValueMenu from './FilterValueMenu';

const ENVIRONMENT_KEY = 'deployment.environment';
const SERVICE_KEY = 'service.name';

interface DomainsToolbarProps {
	search: string;
	onSearch: (value: string) => void;
	isFetching: boolean;
	onRunQuery: () => void;
	onCancelQuery: () => void;
}

/** The list's filter query, environment, calling service, domain search and IP toggle. */
function DomainsToolbar({
	search,
	onSearch,
	isFetching,
	onRunQuery,
	onCancelQuery,
}: DomainsToolbarProps): JSX.Element {
	const [{ showIP }, setParams] = useApiMonitoringParams();
	const { currentQuery, redirectWithQueryBuilderData } = useQueryBuilder();
	const appliedQuery = useGetCompositeQueryParam();
	const query = useMemo(
		() => currentQuery?.builder?.queryData[0] || null,
		[currentQuery],
	);
	const { handleChangeQueryData } = useQueryOperations({
		index: 0,
		query,
		entityVersion: '',
	});

	const handleSearchChange = useCallback(
		(value: string) => {
			(handleChangeQueryData as HandleChangeQueryDataV5)('filter', {
				expression: value,
			});
		},
		[handleChangeQueryData],
	);

	const selected = (key: string): string | undefined =>
		selectedFilterValue(appliedQuery ?? currentQuery, key);

	const select =
		(key: string) =>
		(value: string | undefined): void => {
			redirectWithQueryBuilderData(withFilterValue(currentQuery, key, value));
		};

	const showIpAddresses = showIP ?? true;

	return (
		<div
			data-testid="api-monitoring-toolbar"
			className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2"
		>
			<div className="tw:flex tw:min-w-0 tw:flex-[1_1_420px] tw:items-start tw:gap-2">
				<div className="tw:min-w-0 tw:flex-1">
					<QuerySearch
						dataSource={DataSource.TRACES}
						queryData={query}
						onChange={handleSearchChange}
						onRun={onRunQuery}
						placeholder="Filter, e.g. deployment.environment = 'dev' AND service.name = 'frontend'"
						hardcodedAttributeKeys={ApiMonitoringHardcodedAttributeKeys}
					/>
				</div>
				<RightToolbarActions
					onStageRunQuery={onRunQuery}
					isLoadingQueries={isFetching}
					handleCancelQuery={onCancelQuery}
				/>
			</div>
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:font-sans">
				<FilterValueMenu
					label="Environment"
					attributeKey={ENVIRONMENT_KEY}
					allLabel="All environments"
					value={selected(ENVIRONMENT_KEY)}
					onChange={select(ENVIRONMENT_KEY)}
					testId="api-monitoring-environment"
				/>
				<FilterValueMenu
					label="Calling service"
					attributeKey={SERVICE_KEY}
					allLabel="All services"
					value={selected(SERVICE_KEY)}
					onChange={select(SERVICE_KEY)}
					testId="api-monitoring-service"
				/>
				<div className="tw:relative tw:w-56">
					<Search
						aria-hidden="true"
						className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
					/>
					<Input
						type="search"
						aria-label="Search domains"
						placeholder="Search domains"
						data-testid="api-monitoring-domain-search"
						value={search}
						onChange={(event): void => onSearch(event.target.value)}
						className="tw:h-9 tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
					/>
				</div>
				<label
					htmlFor="api-monitoring-show-ip"
					className="tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-[13px] tw:whitespace-nowrap tw:text-muted-foreground"
				>
					<Switch
						id="api-monitoring-show-ip"
						checked={showIpAddresses}
						data-testid="api-monitoring-show-ip"
						onCheckedChange={(checked): void => {
							logEvent('API Monitoring: Show IP addresses clicked', {
								showIP: checked,
							});
							setParams({ showIP: checked });
						}}
					/>
					Show IP addresses
				</label>
			</div>
		</div>
	);
}

export default DomainsToolbar;
