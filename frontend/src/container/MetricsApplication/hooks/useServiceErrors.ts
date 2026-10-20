import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import getAll from 'api/errors/getAll';
import getErrorCounts from 'api/errors/getErrorCounts';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import {
	ErrorMessageRow,
	errorMessageRows,
	ErrorSummary,
	errorSummary,
} from 'lib/apm/errors';
import { scalarRows } from 'lib/apm/queryRange';
import { errorRequests } from 'lib/apm/serviceRequests';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';
import { AppState } from 'store/reducers';
import { Exception } from 'types/api/errors/getAll';
import { GlobalReducer } from 'types/reducer/globalTime';

const TOP_EXCEPTIONS = 10;

interface ServiceErrors {
	exceptions: Exception[];
	messages: ErrorMessageRow[];
	summary: ErrorSummary;
	isLoading: boolean;
}

const finite = (value: number | undefined): number =>
	value !== undefined && Number.isFinite(value) ? value : 0;

/** The service's exceptions (Exceptions' APIs) and its error spans by status message. */
export function useServiceErrors(servicename: string): ServiceErrors {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const tags = useMemo(
		() => convertRawQueriesToTraceSelectedTags(queries),
		[queries],
	);
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();

	const exceptions = useQuery({
		queryKey: ['service-exceptions', minTime, maxTime, servicename, tags],
		queryFn: () =>
			getAll({
				start: minTime,
				end: maxTime,
				serviceName: servicename,
				tags,
				limit: TOP_EXCEPTIONS,
				offset: 0,
				order: 'descending',
				orderParam: 'exceptionCount',
			}),
	});
	const exceptionTypes = useQuery({
		queryKey: ['service-exception-count', minTime, maxTime, servicename, tags],
		queryFn: () =>
			getErrorCounts({
				start: minTime,
				end: maxTime,
				serviceName: servicename,
				exceptionType: '',
				tags,
			}),
	});
	const request = useMemo(
		() => errorRequests({ window, servicename, resourceFilter }),
		[window, servicename, resourceFilter],
	);
	const spans = useApmQueryRange(['service-error-messages'], request);

	return useMemo(() => {
		const list = exceptions.data?.payload ?? [];
		const messages = errorMessageRows(
			scalarRows(spans.data, 'A').map((row) => ({
				message: row.labels.status_message ?? '',
				operation: row.labels.name ?? '',
				count: finite(row.values[0]),
			})),
			list.map((item) => item.exceptionMessage),
		);
		const [current] = scalarRows(spans.data, 'B');
		const [previous] = scalarRows(spans.data, 'C');
		const typeCount = exceptionTypes.data?.payload;
		return {
			exceptions: list,
			messages,
			summary: errorSummary({
				spans: finite(current?.values[0]),
				errorSpans: finite(current?.values[1]),
				previousSpans: previous ? finite(previous.values[0]) : undefined,
				previousErrorSpans: previous ? finite(previous.values[1]) : undefined,
				exceptions: list.reduce((sum, item) => sum + item.exceptionCount, 0),
				exceptionTypes: typeof typeCount === 'number' ? typeCount : list.length,
			}),
			isLoading: spans.isLoading || exceptions.isLoading,
		};
	}, [
		exceptions.data,
		exceptions.isLoading,
		exceptionTypes.data,
		spans.data,
		spans.isLoading,
	]);
}
