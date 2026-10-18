import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import useUrlQuery from 'hooks/useUrlQuery';
import createQueryParams from 'lib/createQueryParams';
import history from 'lib/history';
import { Order, OrderBy } from 'types/api/errors/getAll';

import { ColumnFilterKey } from './types';
import {
	getFilterString,
	getFilterValues,
	getOffSet,
	getOrder,
	getOrderParams,
	getUpdatePageSize,
	urlKey,
} from './utils';

export interface AllErrorsParams {
	order: Order;
	offset: number;
	orderParam: OrderBy;
	pageSize: number;
	exceptionType: string;
	serviceName: string;
	compositeQuery: string;
	/** The list's own params, the react-query key of the list request. */
	updatedPath: string;
	onSort: (column: OrderBy) => void;
	onPageChange: (page: number, pageSize: number) => void;
	onFilter: (filterKey: ColumnFilterKey, value: string) => void;
}

/** Sort, paging and column filters of the exceptions list, kept in the url. */
export function useAllErrorsParams(): AllErrorsParams {
	const { pathname } = useLocation();
	const params = useUrlQuery();

	const order = getOrder(params.get(urlKey.order));
	const offset = getOffSet(params.get(urlKey.offset));
	const orderParam = getOrderParams(params.get(urlKey.orderParam));
	const pageSize = getUpdatePageSize(params.get(urlKey.pageSize));
	const exceptionType = getFilterString(params.get(urlKey.exceptionType));
	const serviceName = getFilterString(params.get(urlKey.serviceName));
	const compositeQuery = getFilterString(params.get(urlKey.compositeQuery));

	const updatedPath = useMemo(
		() =>
			`${pathname}?${createQueryParams({
				order,
				offset,
				orderParam,
				pageSize,
				exceptionType,
				serviceName,
			})}`,
		[pathname, order, offset, orderParam, pageSize, exceptionType, serviceName],
	);

	const replace = useCallback(
		(next: Record<string, string | number>): void => {
			history.replace(`${pathname}?${createQueryParams(next)}`);
		},
		[pathname],
	);

	const onSort = useCallback(
		(column: OrderBy): void => {
			let nextOrder: Order = 'ascending';
			if (column === orderParam && order === 'ascending') {
				nextOrder = 'descending';
			}
			replace({
				order: nextOrder,
				offset: 0,
				orderParam: column,
				pageSize,
				exceptionType,
				serviceName,
				compositeQuery,
			});
		},
		[
			compositeQuery,
			exceptionType,
			order,
			orderParam,
			pageSize,
			replace,
			serviceName,
		],
	);

	const onPageChange = useCallback(
		(page: number, nextPageSize: number): void => {
			replace({
				order,
				offset: (page - 1) * nextPageSize,
				orderParam,
				pageSize: nextPageSize,
				exceptionType,
				serviceName,
				compositeQuery,
			});
		},
		[compositeQuery, exceptionType, order, orderParam, replace, serviceName],
	);

	const onFilter = useCallback(
		(filterKey: ColumnFilterKey, value: string): void => {
			const { exceptionFilterValue, serviceFilterValue } = getFilterValues(
				serviceName,
				exceptionType,
				filterKey,
				value,
			);
			const next: Record<string, string | number> = {
				order,
				offset: 0,
				orderParam,
				pageSize,
				compositeQuery,
			};
			if (exceptionFilterValue) {
				next.exceptionType = exceptionFilterValue;
			}
			if (serviceFilterValue) {
				next.serviceName = serviceFilterValue;
			}
			replace(next);
		},
		[
			compositeQuery,
			exceptionType,
			order,
			orderParam,
			pageSize,
			replace,
			serviceName,
		],
	);

	return {
		order,
		offset,
		orderParam,
		pageSize,
		exceptionType,
		serviceName,
		compositeQuery,
		updatedPath,
		onSort,
		onPageChange,
		onFilter,
	};
}
