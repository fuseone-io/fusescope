import { useCallback, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { QueryParams } from 'constants/query';
import { ViewMenuAction } from 'container/WidgetCard/config';
import GridCard from 'container/WidgetCard/Card';
import { Button } from 'container/MetricsApplication/Tabs/styles';
import { useGraphClickHandler } from 'container/MetricsApplication/Tabs/util';
import useUrlQuery from 'hooks/useUrlQuery';
import { OnClickPluginOpts } from 'lib/uPlotLib/plugins/onClickPlugin';
import { getStartAndEndTimesInMilliseconds } from 'pages/MessagingQueues/MessagingQueuesUtils';
import { UpdateTimeInterval } from 'store/actions';
import { AppState } from 'store/reducers';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';

import {
	applyCeleryFilterOnWidgetData,
	createFiltersFromData,
	getFiltersFromQueryParams,
} from '../CeleryUtils';
import { useNavigateToExplorer } from '../useNavigateToExplorer';
import { celeryTaskLatencyWidgetData } from './CeleryTaskGraphUtils';

import './CeleryTaskGraph.style.scss';

interface TabData {
	label: string;
	key: string;
}

export enum CeleryTaskGraphState {
	P99 = 'p99',
	P95 = 'p95',
	P90 = 'p90',
}

function CeleryTaskLatencyGraph({
	queryEnabled,
	checkIfDataExists,
}: {
	queryEnabled: boolean;
	checkIfDataExists?: (isDataAvailable: boolean) => void;
}): JSX.Element {
	const history = useHistory();
	const { pathname } = useLocation();
	const dispatch = useDispatch();
	const urlQuery = useUrlQuery();

	const tabs: TabData[] = [
		{ label: CeleryTaskGraphState.P99, key: CeleryTaskGraphState.P99 },
		{ label: CeleryTaskGraphState.P95, key: CeleryTaskGraphState.P95 },
		{ label: CeleryTaskGraphState.P90, key: CeleryTaskGraphState.P90 },
	];

	const [graphState, setGraphState] = useState<CeleryTaskGraphState>(
		CeleryTaskGraphState.P99,
	);

	const handleTabClick = (key: CeleryTaskGraphState): void => {
		setGraphState(key as CeleryTaskGraphState);
		logEvent('MQ Celery: Task latency graph tab clicked', {
			taskName: urlQuery.get(QueryParams.taskName),
			graphState: key,
		});
	};

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
		[dispatch, history, pathname, urlQuery],
	);

	const selectedFilters = useMemo(
		() =>
			getFiltersFromQueryParams(
				QueryParams.taskName,
				urlQuery,
				'celery.task_name',
			),
		[urlQuery],
	);

	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const celeryTaskLatencyData = useMemo(
		() => celeryTaskLatencyWidgetData(graphState, minTime, maxTime),
		[graphState, minTime, maxTime],
	);

	const updatedWidgetData = useMemo(
		() =>
			applyCeleryFilterOnWidgetData(selectedFilters || [], celeryTaskLatencyData),
		[celeryTaskLatencyData, selectedFilters],
	);

	const [selectedTimeStamp, setSelectedTimeStamp] = useState<number>(0);
	const [entityData, setEntityData] = useState<{
		entity: string;
		value: string;
	}>();

	const handleSetTimeStamp = useCallback((selectTime: number) => {
		setSelectedTimeStamp(selectTime);
	}, []);

	const onGraphClickHandler = useGraphClickHandler(handleSetTimeStamp);

	const onGraphClick = useCallback(
		(type: string): OnClickPluginOpts['onClick'] =>
			(xValue, yValue, mouseX, mouseY, data): Promise<void> => {
				const [firstDataPoint] = Object.entries(data || {});
				const [entity, value] = firstDataPoint;
				setEntityData({
					entity,
					value,
				});

				return onGraphClickHandler(xValue, yValue, mouseX, mouseY, type);
			},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[handleSetTimeStamp],
	);

	const navigateToExplorer = useNavigateToExplorer();

	const goToTraces = useCallback(() => {
		const { start, end } = getStartAndEndTimesInMilliseconds(selectedTimeStamp);
		const filters = createFiltersFromData({
			[entityData?.entity as string]: entityData?.value,
		});
		navigateToExplorer({
			filters,
			dataSource: DataSource.TRACES,
			startTime: start,
			endTime: end,
			sameTab: true,
		});
	}, [entityData, navigateToExplorer, selectedTimeStamp]);

	const buttonId = `Celery_${graphState}_latency`;

	return (
		<ContentPanel
			testId="celery-task-latency"
			className="celery-task-graph-task-latency"
			bodyClassName="tw:flex tw:min-h-0 tw:flex-col"
		>
			<div className="tw:absolute tw:top-2.5 tw:right-12 tw:z-10">
				<SegmentedControl
					label="Percentile"
					size="sm"
					value={graphState}
					onChange={handleTabClick}
					options={tabs.map((tab) => ({
						value: tab.key as CeleryTaskGraphState,
						label: tab.label.toUpperCase(),
						testId: `celery-latency-${tab.key}`,
					}))}
				/>
			</div>
			<div className="celery-task-graph-grid-content tw:pt-2">
				<Button
					type="default"
					size="small"
					id={`${buttonId}_button`}
					onClick={goToTraces}
				>
					View Traces
				</Button>
				<GridCard
					key={graphState}
					widget={updatedWidgetData}
					headerMenuList={[...ViewMenuAction]}
					onDragSelect={onDragSelect}
					onClickHandler={onGraphClick(buttonId)}
					isQueryEnabled={queryEnabled}
					dataAvailable={checkIfDataExists}
				/>
			</div>
		</ContentPanel>
	);
}

export default CeleryTaskLatencyGraph;

CeleryTaskLatencyGraph.defaultProps = {
	checkIfDataExists: undefined,
};
