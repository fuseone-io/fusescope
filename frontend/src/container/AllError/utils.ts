import Timestamp from 'timestamp-nano';
import { Order, OrderBy } from 'types/api/errors/getAll';

import {
	EXCEPTION_TYPE_FILTER_NAME,
	SERVICE_NAME_FILTER_NAME,
} from './constant';

export const isOrder = (order: string | null): order is Order =>
	!!(order === 'ascending' || order === 'descending');

export const urlKey = {
	order: 'order',
	offset: 'offset',
	orderParam: 'orderParam',
	pageSize: 'pageSize',
	exceptionType: 'exceptionType',
	serviceName: 'serviceName',
	compositeQuery: 'compositeQuery',
};

export const isOrderParams = (orderBy: string | null): orderBy is OrderBy =>
	!!(
		orderBy === 'serviceName' ||
		orderBy === 'exceptionCount' ||
		orderBy === 'lastSeen' ||
		orderBy === 'firstSeen' ||
		orderBy === 'exceptionType'
	);

export const getOrder = (order: string | null): Order => {
	if (isOrder(order)) {
		return order;
	}
	return 'ascending';
};

export const getLimit = (limit: string | null): number => {
	if (limit) {
		return parseInt(limit, 10);
	}
	return 10;
};

export const getOffSet = (offset: string | null): number => {
	if (offset && typeof offset === 'string') {
		return parseInt(offset, 10);
	}
	return 0;
};

export const getOrderParams = (order: string | null): OrderBy => {
	if (isOrderParams(order)) {
		return order;
	}
	return 'serviceName';
};

export const getNanoSeconds = (date: string): string =>
	Math.floor(new Date(date).getTime() / 1e3).toString() +
	String(Timestamp.fromString(date).getNano().toString()).padStart(9, '0');

export const getUpdatePageSize = (pageSize: string | null): number => {
	if (pageSize) {
		return parseInt(pageSize, 10);
	}
	return 10;
};

export const getFilterString = (filter: string | null): string => {
	if (filter) {
		return filter;
	}
	return '';
};

export const getFilterValues = (
	serviceName: string,
	exceptionType: string,
	filterKey: string,
	filterValue: string,
): { exceptionFilterValue: string; serviceFilterValue: string } => {
	let serviceFilterValue = serviceName;
	let exceptionFilterValue = exceptionType;
	switch (filterKey) {
		case EXCEPTION_TYPE_FILTER_NAME:
			exceptionFilterValue = filterValue;
			break;
		case SERVICE_NAME_FILTER_NAME:
			serviceFilterValue = filterValue;
			break;
		default:
			break;
	}
	return { exceptionFilterValue, serviceFilterValue };
};
