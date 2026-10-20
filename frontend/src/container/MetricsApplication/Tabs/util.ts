import { Dispatch, SetStateAction, useMemo, useRef } from 'react';
import { QueryParams } from 'constants/query';
import { initialQueriesMap, PANEL_TYPES } from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { routeConfig } from 'container/SideNav/config';
import { getQueryString } from 'container/SideNav/helper';
import { buildSeverityClause } from 'components/QuickFilters/FilterRenderers/Severity/severityFilterQuery';
import { convertFiltersToExpression } from 'components/QueryBuilderV2/utils';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import useClickOutside from 'hooks/useClickOutside';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { resourceAttributesToTracesFilterItems } from 'hooks/useResourceAttribute/utils';
import createQueryParams from 'lib/createQueryParams';
import { prepareQueryWithDefaultTimestamp } from 'pages/LogsExplorer/utils';
import { traceFilterKeys } from 'constants/traceFilterKeys';
import {
	BaseAutocompleteData,
	DataTypes,
} from 'types/api/queryBuilder/queryAutocompleteResponse';
import {
	IBuilderQuery,
	Query,
	TagFilterItem,
} from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';
import { v4 as uuid } from 'uuid';

interface ExternalApisPathProps {
	servicename: string;
	domainName: string;
	isError: boolean;
	startTime: number;
	endTime: number;
}

export function generateExplorerPath(
	isViewLogsClicked: boolean | undefined,
	urlParams: URLSearchParams,
	servicename: string | undefined,
	selectedTraceTags: string,
	JSONCompositeQuery: string,
	queryString: string[],
): string {
	const basePath = isViewLogsClicked
		? ROUTES.LOGS_EXPLORER
		: ROUTES.TRACES_EXPLORER;

	return `${basePath}?${urlParams.toString()}&selected={"serviceName":["${servicename}"]}&filterToFetchData=["duration","status","serviceName"]&spanAggregateCurrentPage=1&selectedTags=${selectedTraceTags}&${
		QueryParams.compositeQuery
	}=${JSONCompositeQuery}&${queryString.join('&')}`;
}

interface ServiceExplorerPathProps {
	isLogs: boolean;
	search: string;
	servicename: string;
	selectedTraceTags: string;
	query: Query;
	startTimeMs: number;
	endTimeMs: number;
}

/** The traces or logs explorer for `query` over the given range. */
export function serviceExplorerPath({
	isLogs,
	search,
	servicename,
	selectedTraceTags,
	query,
	startTimeMs,
	endTimeMs,
}: ServiceExplorerPathProps): string {
	const urlParams = new URLSearchParams(search);
	urlParams.set(QueryParams.startTime, startTimeMs.toString());
	urlParams.set(QueryParams.endTime, endTimeMs.toString());
	urlParams.delete(QueryParams.relativeTime);
	const queryString = getQueryString(
		routeConfig[ROUTES.TRACES_EXPLORER],
		urlParams,
	);

	return generateExplorerPath(
		isLogs,
		urlParams,
		servicename,
		selectedTraceTags,
		encodeURIComponent(JSON.stringify(query)),
		queryString,
	);
}

const generateAPIMonitoringPath = (
	domainName: string,
	startTime: number,
	endTime: number,
	filters: IBuilderQuery['filters'],
): string => {
	const basePath = ROUTES.API_MONITORING;
	return `${basePath}?${createQueryParams({
		apiMonitoringParams: JSON.stringify({
			selectedDomain: domainName,
			selectedView: 'endpoint_stats',
			modalTimeRange: {
				startTime,
				endTime,
			},
			selectedInterval: 'custom',
			endPointDetailsLocalFilters: filters,
		}),
	})}`;
};
/** External APIs for `domainName` as called by the service; times in seconds. */
export function externalApisPath({
	servicename,
	domainName,
	isError,
	startTime,
	endTime,
}: ExternalApisPathProps): string {
	const filters = {
		items: [
			...(isError
				? [
						{
							id: uuid().slice(0, 8),
							key: {
								key: 'hasError',
								dataType: DataTypes.bool,
								type: 'tag',
								id: 'hasError--bool--tag--true',
							},
							op: 'in',
							value: ['true'],
						},
					]
				: []),
			{
				id: uuid().slice(0, 8),
				key: {
					key: 'service.name',
					dataType: DataTypes.String,
					type: 'resource',
				},
				op: '=',
				value: servicename,
			},
		],
		op: 'AND',
	};
	return generateAPIMonitoringPath(domainName, startTime, endTime, filters);
}

export function useGraphClickHandler(
	setSelectedTimeStamp: (n: number) => void | Dispatch<SetStateAction<number>>,
	setSelectedData?: (data: any) => void | Dispatch<SetStateAction<any>>,
): (
	xValue: number,
	yValue: number,
	mouseX: number,
	mouseY: number,
	type: string,
	data?: any,
) => Promise<void> {
	const buttonRef = useRef<HTMLElement | null>(null);

	useClickOutside({
		ref: buttonRef,
		onClickOutside: () => {
			if (buttonRef.current) {
				buttonRef.current.style.display = 'none';
			}
		},
		eventType: 'mousedown',
	});

	return async (
		xValue: number,
		yValue: number,
		mouseX: number,
		mouseY: number,
		type: string,
		data?: any,
	): Promise<void> => {
		const id = `${type}_button`;
		const buttonElement = document.getElementById(id);
		buttonRef.current = buttonElement;

		if (xValue) {
			if (buttonElement) {
				buttonElement.style.display = 'block';
				buttonElement.style.left = `${mouseX}px`;
				buttonElement.style.top = `${mouseY}px`;
				setSelectedTimeStamp(Math.floor(xValue));
				if (setSelectedData && data) {
					setSelectedData(data);
				}
			}
		} else if (buttonElement && buttonElement.style.display === 'block') {
			buttonElement.style.display = 'none';
		}
	};
}

export const handleNonInQueryRange = (tags: TagFilterItem[]): TagFilterItem[] =>
	tags.map((tag) => {
		if (tag.op === 'Not IN') {
			return {
				...tag,
				op: 'NIN',
			};
		}
		return tag;
	});

export function handleQueryChange(
	query: Query,
	attributeKeys: BaseAutocompleteData,
	serviceAttribute: string,
	filters?: TagFilterItem[],
	logs?: boolean,
): Query {
	const filterItem: TagFilterItem[] = [
		{
			id: uuid().slice(0, 8),
			key: attributeKeys,
			op: logs ? '=' : 'in',
			value: serviceAttribute,
		},
	];
	return {
		...query,
		builder: {
			...query.builder,
			queryData: query.builder.queryData?.map((item) => ({
				...item,
				filters: {
					...item.filters,
					items: [...(item.filters?.items || []), ...filterItem, ...(filters || [])],
					op: item.filters?.op || 'AND',
				},
			})),
		},
	};
}

export function useGetAPMToLogsQueries({
	servicename,
	filters,
}: {
	servicename: string;
	filters?: TagFilterItem[];
}): Query {
	const { updateAllQueriesOperators } = useQueryBuilder();
	const { queries } = useResourceAttribute();

	return useMemo(() => {
		const updatedQuery = prepareQueryWithDefaultTimestamp(
			updateAllQueriesOperators(
				initialQueriesMap.logs,
				PANEL_TYPES.LIST,
				DataSource.LOGS,
			),
		);
		const serviceName = {
			id: 'service.name--string--resource--true',
			dataType: DataTypes.String,
			key: 'service.name',
			type: 'resource',
		};

		return handleQueryChange(
			updatedQuery,
			serviceName,
			servicename,
			[...(filters ?? []), ...resourceAttributesToTracesFilterItems(queries)],
			true,
		);
		// Callers pass fixed filters with fresh ids every render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [servicename, queries, updateAllQueriesOperators]);
}

/**
 * `query` narrowed to error and fatal logs, by the same severity clause the
 * logs explorer's severity filter writes, so every spelling matches.
 */
export function withErrorSeverity(query: Query): Query {
	return {
		...query,
		builder: {
			...query.builder,
			queryData: query.builder.queryData.map((queryData) => {
				const { expression } = convertFiltersToExpression(
					queryData.filters ?? { items: [], op: 'AND' },
				);
				return {
					...queryData,
					filter: {
						expression: [expression, buildSeverityClause(['ERROR', 'FATAL'])]
							.filter(Boolean)
							.join(' AND '),
					},
				};
			}),
		},
	};
}

export function useGetAPMToTracesQueries({
	servicename,
	isExternalCall,
	isDBCall,
	filters,
}: {
	servicename: string;
	isExternalCall?: boolean;
	isDBCall?: boolean;
	filters?: TagFilterItem[];
}): Query {
	const { updateAllQueriesOperators } = useQueryBuilder();
	const { queries } = useResourceAttribute();

	const resourceAttributesFilters = useMemo(
		() => resourceAttributesToTracesFilterItems(queries),
		[queries],
	);
	const finalFilters: TagFilterItem[] = [];
	let spanKindFilter: TagFilterItem;
	let dbCallFilter: TagFilterItem;

	if (isExternalCall) {
		spanKindFilter = {
			id: uuid().slice(0, 8),
			key: {
				key: 'spanKind',
				dataType: DataTypes.String,
				type: 'tag',
				id: 'spanKind--string--tag--true',
			},
			op: '=',
			value: 'Client',
		};
		finalFilters.push(spanKindFilter);
	}

	if (isDBCall) {
		dbCallFilter = {
			id: uuid().slice(0, 8),
			key: {
				key: 'dbSystem',
				dataType: DataTypes.String,
				type: 'tag',
				id: 'dbSystem--string--tag--true',
			},
			op: 'exists',
			value: '',
		};
		finalFilters.push(dbCallFilter);
	}

	if (filters?.length) {
		finalFilters.push(...filters);
	}

	if (resourceAttributesFilters?.length) {
		finalFilters.push(...resourceAttributesFilters);
	}

	return useMemo(() => {
		const updatedQuery = updateAllQueriesOperators(
			initialQueriesMap.traces,
			PANEL_TYPES.TRACE,
			DataSource.TRACES,
		);

		return handleQueryChange(
			updatedQuery,
			traceFilterKeys.serviceName,
			servicename,
			finalFilters,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [servicename, queries, updateAllQueriesOperators]);
}
