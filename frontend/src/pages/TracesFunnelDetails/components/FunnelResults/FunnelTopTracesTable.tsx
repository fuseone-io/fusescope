import { useMemo } from 'react';
import { UseQueryResult } from 'react-query';
import {
	ErrorTraceData,
	FunnelOverviewPayload,
	SlowTraceData,
} from 'api/traceFunnels';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';
import { ErrorResponse, SuccessResponse } from 'types/api';
import { FunnelStepData } from 'types/api/traceFunnels';

import FunnelTable from './FunnelTable';
import { TopTraceRow } from './types';

interface FunnelTopTracesTableProps {
	funnelId: string;
	stepAOrder: number;
	stepBOrder: number;
	title: string;
	tooltip: string;
	useQueryHook: (
		funnelId: string,
		payload: FunnelOverviewPayload,
	) => UseQueryResult<
		SuccessResponse<SlowTraceData | ErrorTraceData> | ErrorResponse,
		Error
	>;
	steps: FunnelStepData[];
	markErrors?: boolean;
}

function FunnelTopTracesTable({
	funnelId,
	stepAOrder,
	stepBOrder,
	title,
	tooltip,
	steps,
	useQueryHook,
	markErrors,
}: FunnelTopTracesTableProps): JSX.Element {
	const { startTime, endTime } = useFunnelContext();
	const payload = useMemo(
		() => ({
			start_time: startTime,
			end_time: endTime,
			step_start: stepAOrder,
			step_end: stepBOrder,
			steps,
		}),
		[startTime, endTime, stepAOrder, stepBOrder, steps],
	);

	const {
		data: response,
		isLoading,
		isFetching,
	} = useQueryHook(funnelId, payload);

	const data = useMemo((): TopTraceRow[] => {
		if (!response?.payload?.data) {
			return [];
		}
		return response.payload.data.map((item) => ({
			trace_id: item.data.trace_id,
			duration_ms: item.data.duration_ms,
			span_count: item.data.span_count,
		}));
	}, [response]);

	return (
		<FunnelTable
			title={title}
			tooltip={tooltip}
			data={data}
			loading={isLoading || isFetching}
			markErrors={markErrors}
		/>
	);
}

export default FunnelTopTracesTable;
