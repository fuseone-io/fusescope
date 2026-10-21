import { useEffect, useRef, useState } from 'react';
import logEvent from 'api/common/logEvent';
import CeleryTaskConfigOptions from 'components/CeleryTask/CeleryTaskConfigOptions/CeleryTaskConfigOptions';
import CeleryTaskDetail, {
	CaptureDataProps,
} from 'components/CeleryTask/CeleryTaskDetail/CeleryTaskDetail';
import CeleryTaskGraphGrid from 'components/CeleryTask/CeleryTaskGraph/CeleryTaskGraphGrid';
import { QueryParams } from 'constants/query';
import useUrlQuery from 'hooks/useUrlQuery';

export default function CeleryTask(): JSX.Element {
	const [task, setTask] = useState<CaptureDataProps | null>(null);
	const loggedRef = useRef(false);

	const taskName = useUrlQuery().get(QueryParams.taskName);

	useEffect(() => {
		if (taskName && !loggedRef.current) {
			logEvent('MQ Celery: Task name filter', {
				taskName,
			});
			loggedRef.current = true;
		}
	}, [taskName]);

	const onTaskClick = (captureData: CaptureDataProps): void => {
		setTask(captureData);
	};

	return (
		<div className="celery-task-container" data-testid="celery-task-page">
			<CeleryTaskGraphGrid
				onClick={onTaskClick}
				queryEnabled={!task}
				configureOptionComponent={<CeleryTaskConfigOptions />}
			/>
			{!!task && (
				<CeleryTaskDetail
					onClose={(): void => {
						setTask(null);
					}}
					widgetData={task.widgetData}
					taskData={task}
					drawerOpen={!!task}
				/>
			)}
		</div>
	);
}
