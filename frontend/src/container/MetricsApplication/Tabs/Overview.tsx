import { useCallback, useEffect, useMemo, useRef } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch } from 'react-redux';
import { useLocation, useParams } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { QueryParams } from 'constants/query';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { getResourceDeploymentKeys } from 'hooks/useResourceAttribute/utils';
import useUrlQuery from 'hooks/useUrlQuery';
import { serviceHighlights } from 'lib/apm/highlights';
import history from 'lib/history';
import {
	ERROR_SPANS_FILTER,
	useTracesLink,
} from 'pages/MetricsApplication/hooks/useTracesLink';
import { UpdateTimeInterval } from 'store/actions';

import { useOperationTraceNavigation } from '../KeyOperations/useOperationTraceNavigation';
import { useEndpoints } from '../hooks/useEndpoints';
import { useLatencyHistogram } from '../hooks/useLatencyHistogram';
import { useServiceDependencies } from '../hooks/useServiceDependencies';
import { useServiceKpis } from '../hooks/useServiceKpis';
import { useServiceMonitors } from '../hooks/useServiceMonitors';
import HighlightsPanel from './Overview/HighlightsPanel';
import LatencyDistribution from './Overview/LatencyDistribution';
import MonitorsPanel from './Overview/MonitorsPanel';
import OverviewCharts from './Overview/OverviewCharts';
import ServiceKpis from './Overview/ServiceKpis';
import TopEndpoints from './Overview/TopEndpoints';
import { IServiceName } from './types';

const ENDPOINT_OPTIONS = { groupBy: 'name', entryPoint: false } as const;

interface OverviewProps {
	/** Draws the previous period on the charts and the deltas on the KPIs. */
	compare?: boolean;
	onOpenEndpoints?: () => void;
	onOpenDependencies?: () => void;
}

function Application({
	compare = false,
	onOpenEndpoints = (): void => {},
	onOpenDependencies = (): void => {},
}: OverviewProps): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const servicename = decodeURIComponent(encodedServiceName);

	const { pathname } = useLocation();
	const { queries } = useResourceAttribute();
	const urlQuery = useUrlQuery();
	const dispatch = useDispatch();

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current) {
			const selectedEnvironments = queries.find(
				(val) => val.tagKey === getResourceDeploymentKeys(),
			)?.tagValue;

			void logEvent('APM: Service detail page visited', {
				selectedEnvironments,
				resourceAttributeUsed: !!queries?.length,
				section: 'overview',
			});
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onDragSelect = useCallback(
		(start: number, end: number) => {
			const startTimestamp = Math.trunc(start);
			const endTimestamp = Math.trunc(end);

			urlQuery.set(QueryParams.startTime, startTimestamp.toString());
			urlQuery.set(QueryParams.endTime, endTimestamp.toString());
			const generatedUrl = `${pathname}?${urlQuery.toString()}`;
			history.push(generatedUrl);

			if (startTimestamp !== endTimestamp) {
				dispatch(UpdateTimeInterval('custom', [startTimestamp, endTimestamp]));
			}
		},
		[dispatch, pathname, urlQuery],
	);

	const kpis = useServiceKpis(servicename);
	const { downstream } = useServiceDependencies(servicename);
	const histogram = useLatencyHistogram(servicename);
	const monitors = useServiceMonitors(servicename);
	const endpoints = useEndpoints(servicename, ENDPOINT_OPTIONS);
	const openOperation = useOperationTraceNavigation(servicename);
	const tracesLink = useTracesLink(servicename);

	const highlights = useMemo(
		() =>
			kpis.current
				? serviceHighlights({
						current: kpis.current,
						previous: kpis.previous,
						failingDependencies: downstream,
					})
				: [],
		[kpis, downstream],
	);
	const targets = useMemo(
		() => ({
			slowTraces: tracesLink(),
			errorTraces: tracesLink([ERROR_SPANS_FILTER]),
			onOpenEndpoints,
			onOpenDependencies,
		}),
		[tracesLink, onOpenEndpoints, onOpenDependencies],
	);

	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<ServiceKpis
				current={kpis.current}
				previous={kpis.previous}
				isLoading={kpis.isLoading}
				compare={compare}
			/>
			<HighlightsPanel highlights={highlights} targets={targets} />
			<OverviewCharts
				servicename={servicename}
				compare={compare}
				onDragSelect={onDragSelect}
			/>
			<div className="tw:flex tw:flex-wrap tw:items-stretch tw:gap-4">
				<LatencyDistribution
					buckets={histogram.buckets}
					isLoading={histogram.isLoading}
				/>
				<div className="tw:flex tw:min-w-0 tw:flex-[1_1_340px] tw:flex-col">
					<MonitorsPanel
						servicename={servicename}
						rules={monitors.rules}
						isLoading={monitors.isLoading}
					/>
				</div>
			</div>
			<TopEndpoints
				rows={endpoints.rows}
				isLoading={endpoints.isLoading}
				onOpen={openOperation}
				onShowAll={onOpenEndpoints}
			/>
		</div>
	);
}

export type ClickHandlerType = () => void;

export default Application;
