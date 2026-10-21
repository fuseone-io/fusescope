import { ChartColumn, ScrollText } from 'lucide-react';
import {
	CollectedLogAttribute,
	CollectedMetric,
} from 'types/api/integrations/types';

import DataCollectedTable, { DataCollectedColumn } from './DataCollectedTable';

interface DataCollectedProps {
	logsData: CollectedLogAttribute[];
	metricsData: CollectedMetric[];
}

const LOGS_COLUMNS: DataCollectedColumn<CollectedLogAttribute>[] = [
	{ key: 'name', label: 'Name' },
	{ key: 'path', label: 'Path', mono: true },
	{ key: 'type', label: 'Type' },
];

const METRICS_COLUMNS: DataCollectedColumn<CollectedMetric>[] = [
	{ key: 'name', label: 'Name', mono: true },
	{ key: 'type', label: 'Type' },
	{ key: 'unit', label: 'Unit' },
];

const ICON_CLASS = 'tw:size-4 tw:text-muted-foreground';

function DataCollected({
	logsData,
	metricsData,
}: DataCollectedProps): JSX.Element {
	return (
		<div
			data-testid="integration-data-collected"
			className="tw:flex tw:flex-col tw:gap-4"
		>
			<DataCollectedTable
				testId="integration-data-collected-logs"
				title="Logs"
				icon={<ScrollText aria-hidden="true" className={ICON_CLASS} />}
				columns={LOGS_COLUMNS}
				rows={logsData ?? []}
			/>
			<DataCollectedTable
				testId="integration-data-collected-metrics"
				title="Metrics"
				icon={<ChartColumn aria-hidden="true" className={ICON_CLASS} />}
				columns={METRICS_COLUMNS}
				rows={metricsData ?? []}
			/>
		</div>
	);
}

export default DataCollected;
