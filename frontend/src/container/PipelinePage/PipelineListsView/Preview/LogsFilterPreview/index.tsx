import { useState } from 'react';
import { RelativeDurationOptions } from 'container/TopNav/DateTimeSelectionV2/constants';
import { TagFilter } from 'types/api/queryBuilder/queryBuilderData';

import PreviewIntervalSelector from '../components/PreviewIntervalSelector';
import SampleLogs from '../components/SampleLogs';

import './styles.scss';

function LogsFilterPreview({ filter }: LogsFilterPreviewProps): JSX.Element {
	const last1HourInterval = RelativeDurationOptions[3].value;
	const [previewTimeInterval, setPreviewTimeInterval] =
		useState(last1HourInterval);

	const isEmptyFilter = (filter?.items?.length || 0) < 1;

	return (
		<div className="pipelines-preview-box">
			<div className="pipelines-preview-box__header">
				<span className="pipelines-preview-box__title">Filtered Logs Preview</span>
				<PreviewIntervalSelector
					previewFilter={filter}
					value={previewTimeInterval}
					onChange={setPreviewTimeInterval}
				/>
			</div>
			<div className="logs-filter-preview-content">
				{isEmptyFilter ? (
					<div>Please select a filter</div>
				) : (
					<SampleLogs filter={filter} timeInterval={previewTimeInterval} count={5} />
				)}
			</div>
		</div>
	);
}

interface LogsFilterPreviewProps {
	filter: TagFilter;
}

export default LogsFilterPreview;
