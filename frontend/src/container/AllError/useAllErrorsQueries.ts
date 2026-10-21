import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import getAll from 'api/errors/getAll';
import getErrorCounts from 'api/errors/getErrorCounts';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useNotifications } from 'hooks/useNotifications';
import useResourceAttribute from 'hooks/useResourceAttribute';
import {
	convertCompositeQueryToTraceSelectedTags,
	getResourceDeploymentKeys,
} from 'hooks/useResourceAttribute/utils';
import { isUndefined } from 'lodash-es';
import { useAllErrorsQueryState } from 'pages/AllErrors/QueryStateContext';
import { AppState } from 'store/reducers';
import { ErrorResponse, SuccessResponse } from 'types/api';
import { Exception, PayloadProps } from 'types/api/errors/getAll';
import { GlobalReducer } from 'types/reducer/globalTime';

import { AllErrorsParams } from './useAllErrorsParams';
import { useExceptionsStripInfo } from './useExceptionsStripInfo';

interface AllErrorsQueries {
	rows: Exception[];
	total: number;
	isLoading: boolean;
	isCancelled: boolean;
}

/** The list and its total for the url's page, sort and filters. */
export function useAllErrorsQueries(params: AllErrorsParams): AllErrorsQueries {
	const { maxTime, minTime, loading } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { t } = useTranslation(['common']);
	const { queries } = useResourceAttribute();
	const compositeData = useGetCompositeQueryParam();

	const setIsFetching = useAllErrorsQueryState((s) => s.setIsFetching);
	const setGroupCount = useAllErrorsQueryState((s) => s.setGroupCount);
	const isCancelled = useAllErrorsQueryState((s) => s.isCancelled);

	const tags = convertCompositeQueryToTraceSelectedTags(
		compositeData?.builder.queryData?.[0]?.filters?.items || [],
	);

	const [{ isLoading, isFetching: isErrorsFetching, data }, errorCountResponse] =
		useQueries([
			{
				queryKey: [
					'getAllErrors',
					params.updatedPath,
					maxTime,
					minTime,
					compositeData,
				],
				queryFn: (): Promise<SuccessResponse<PayloadProps> | ErrorResponse> =>
					getAll({
						end: maxTime,
						start: minTime,
						order: params.order,
						limit: params.pageSize,
						offset: params.offset,
						orderParam: params.orderParam,
						exceptionType: params.exceptionType,
						serviceName: params.serviceName,
						tags,
					}),
				enabled: !loading,
			},
			{
				queryKey: [
					'getErrorCounts',
					maxTime,
					minTime,
					params.exceptionType,
					params.serviceName,
					compositeData,
				],
				queryFn: (): Promise<ErrorResponse | SuccessResponse<number>> =>
					getErrorCounts({
						end: maxTime,
						start: minTime,
						exceptionType: params.exceptionType,
						serviceName: params.serviceName,
						tags,
					}),
				enabled: !loading,
			},
		]);

	useExceptionsStripInfo({
		shownCount: data?.payload?.length ?? 0,
		totalCount: errorCountResponse.data?.payload ?? 0,
	});

	const isFetching = isErrorsFetching || errorCountResponse.isFetching;
	useEffect(() => {
		setIsFetching(isFetching);
	}, [isFetching, setIsFetching]);

	const groupCount = errorCountResponse.data?.payload;
	useEffect(() => {
		setGroupCount(typeof groupCount === 'number' ? groupCount : null);
	}, [groupCount, setGroupCount]);

	const { notifications } = useNotifications();

	useEffect(() => {
		if (data?.error) {
			notifications.error({
				message: data.error || t('something_went_wrong'),
			});
		}
	}, [data?.error, data?.payload, t, notifications]);

	useEffect(() => {
		if (!isUndefined(errorCountResponse.data?.payload)) {
			const selectedEnvironments = queries.find(
				(val) => val.tagKey === getResourceDeploymentKeys(),
			)?.tagValue;

			logEvent('Exception: List page visited', {
				numberOfExceptions: errorCountResponse?.data?.payload,
				selectedEnvironments,
				resourceAttributeUsed: !!(
					compositeData?.builder.queryData?.[0]?.filters?.items?.length || 0
				),
				tags,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [errorCountResponse.data?.payload]);

	return {
		rows: (data?.payload as Exception[] | undefined) ?? [],
		total: errorCountResponse.data?.payload || 0,
		isLoading: isLoading || errorCountResponse.status === 'loading',
		isCancelled,
	};
}
