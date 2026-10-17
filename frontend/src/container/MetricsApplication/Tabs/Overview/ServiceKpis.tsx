import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import Stat from 'components/PageTemplate/components/Stat';
import { useQueryService } from 'hooks/useQueryService';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { Tags } from 'hooks/useResourceAttribute/types';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

interface ServiceKpisProps {
	servicename: string;
}

const PLACEHOLDER = '–';

function nsToMs(value: number): string {
	return (value / 1_000_000).toFixed(2);
}

/** The services list's row for this service, as a strip above the charts. */
function ServiceKpis({ servicename }: ServiceKpisProps): JSX.Element | null {
	const { maxTime, minTime, selectedTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);
	const { queries } = useResourceAttribute();
	const selectedTags = useMemo(
		() => (convertRawQueriesToTraceSelectedTags(queries) as Tags[]) || [],
		[queries],
	);

	const { data, isLoading } = useQueryService({
		minTime,
		maxTime,
		selectedTime,
		selectedTags,
	});

	const service = data?.find((item) => item.serviceName === servicename);
	if (!isLoading && !service) {
		return null;
	}

	return (
		<KpiStrip label="Service metrics" testId="service-kpis">
			<Stat
				label="Requests"
				value={service ? service.callRate.toFixed(2) : PLACEHOLDER}
				unit="ops/s"
				testId="kpi-requests"
			/>
			<Stat
				label="Error rate"
				value={service ? service.errorRate.toFixed(2) : PLACEHOLDER}
				unit="%"
				testId="kpi-error-rate"
			/>
			<Stat
				label="P99 latency"
				value={service ? nsToMs(service.p99) : PLACEHOLDER}
				unit="ms"
				testId="kpi-p99"
			/>
			<Stat
				label="Avg latency"
				value={service ? nsToMs(service.avgDuration) : PLACEHOLDER}
				unit="ms"
				testId="kpi-avg"
			/>
			<Stat
				label="Calls"
				value={service ? service.numCalls.toLocaleString('en-US') : PLACEHOLDER}
				testId="kpi-calls"
			/>
			<Stat
				label="Errors"
				value={service ? service.numErrors.toLocaleString('en-US') : PLACEHOLDER}
				testId="kpi-errors"
			/>
		</KpiStrip>
	);
}

export default ServiceKpis;
