import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import MQChartPanel from 'components/MessagingQueues/MQChartPanel/MQChartPanel';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { AppState } from 'store/reducers';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { DataSource } from 'types/common/queryBuilder';
import { GlobalReducer } from 'types/reducer/globalTime';

import { CaptureDataProps } from '../CeleryTaskDetail/CeleryTaskDetail';
import { useCeleryFilterOptions } from '../useCeleryFilterOptions';
import CeleryTaskBar from './CeleryTaskBar';
import CeleryTaskGraph from './CeleryTaskGraph';
import {
	celeryActiveTasksWidgetData,
	celeryErrorByWorkerWidgetData,
	celeryLatencyByWorkerWidgetData,
	celeryTasksByWorkerWidgetData,
} from './CeleryTaskGraphUtils';
import CeleryTaskLatencyGraph from './CeleryTaskLatencyGraph';

import './CeleryTaskGraph.style.scss';

export default function CeleryTaskGraphGrid({
	onClick,
	queryEnabled,
	configureOptionComponent,
}: {
	onClick: (task: CaptureDataProps) => void;
	queryEnabled: boolean;
	configureOptionComponent?: React.ReactNode;
}): JSX.Element {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const celeryActiveTasksData = useMemo(
		() => celeryActiveTasksWidgetData(minTime, maxTime),
		[minTime, maxTime],
	);

	const celeryErrorByWorkerData = useMemo(
		() => celeryErrorByWorkerWidgetData(minTime, maxTime),
		[minTime, maxTime],
	);

	const celeryLatencyByWorkerData = useMemo(
		() => celeryLatencyByWorkerWidgetData(minTime, maxTime),
		[minTime, maxTime],
	);

	const celeryTasksByWorkerData = useMemo(
		() => celeryTasksByWorkerWidgetData(minTime, maxTime),
		[minTime, maxTime],
	);

	const bottomWidgetData = [
		celeryTasksByWorkerData,
		celeryErrorByWorkerData,
		celeryLatencyByWorkerData,
	];

	const rightPanelTitle = [
		'Tasks/s by worker',
		'Error% by worker',
		'Latency by worker',
	];

	const { options } = useCeleryFilterOptions(
		'worker',
		'rate',
		DataSource.METRICS,
		'flower_task_runtime_seconds_sum',
		DataTypes.String,
		'tag',
	);
	const checkIfDataExists = (isDataAvailable: boolean, title: string): void => {
		if (isDataAvailable) {
			logEvent(`MQ Celery: ${title} data exists`, {
				graph: title,
				isDataAvailable,
			});
		}
	};

	const workersOnline = options.filter((option) => option.value).length;

	return (
		<div className="celery-task-graph-grid-container">
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2">
				{configureOptionComponent}
				<span className="fs-ui tw:font-sans tw:text-xs tw:text-subtle-foreground">
					Select a point on any chart to list the tasks behind it
				</span>
			</div>
			<div className="celery-task-graph-flower">
				<MQChartPanel height="small" testId="celery-flower-active-tasks">
					<CeleryTaskGraph
						key={celeryActiveTasksData.id}
						widgetData={celeryActiveTasksData}
						queryEnabled={queryEnabled}
						customErrorMessage="Enable Flower metrics to view this graph"
						checkIfDataExists={(isDataAvailable): void =>
							checkIfDataExists(isDataAvailable, 'Active Tasks by worker')
						}
						analyticsEvent="MQ Celery: Flower metric not enabled"
					/>
				</MQChartPanel>
				<ContentPanel
					testId="celery-workers-online"
					className="tw:justify-center"
					bodyClassName="fs-ui tw:flex tw:flex-col tw:justify-center tw:gap-1 tw:px-5 tw:py-4 tw:font-sans"
				>
					<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
						Workers online
					</span>
					<span className="tw:text-[32px] tw:leading-[1.1] tw:font-semibold tw:tabular-nums">
						{workersOnline}
					</span>
					<span className="tw:text-xs tw:text-muted-foreground">
						from Flower metrics
					</span>
				</ContentPanel>
			</div>
			<CeleryTaskBar
				queryEnabled={queryEnabled}
				onClick={onClick}
				checkIfDataExists={(isDataAvailable): void =>
					checkIfDataExists(isDataAvailable, 'State Graph')
				}
			/>
			<CeleryTaskLatencyGraph
				queryEnabled={queryEnabled}
				checkIfDataExists={(isDataAvailable): void =>
					checkIfDataExists(isDataAvailable, 'Task Latency')
				}
			/>
			<div className="celery-task-graph-grid-bottom">
				{bottomWidgetData.map((widgetData, index) => (
					<MQChartPanel key={widgetData.id} height="medium">
						<CeleryTaskGraph
							widgetData={widgetData}
							onClick={onClick}
							queryEnabled={queryEnabled}
							rightPanelTitle={rightPanelTitle[index]}
							applyCeleryTaskFilter
							checkIfDataExists={(isDataAvailable): void =>
								checkIfDataExists(isDataAvailable, rightPanelTitle[index])
							}
						/>
					</MQChartPanel>
				))}
			</div>
		</div>
	);
}

CeleryTaskGraphGrid.defaultProps = {
	configureOptionComponent: null,
};
