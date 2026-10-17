import { Typography } from '@signozhq/ui/typography';
import axios from 'axios';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { ENTITY_VERSION_V4 } from 'constants/app';
import Graph from 'container/WidgetCard/Card';
import { SERVICE_DETAIL_DRILLDOWN_ENABLED } from 'container/MetricsApplication/constant';
import ChartPanel from 'container/MetricsApplication/components/ChartPanel';
import { GraphContainer } from 'container/MetricsApplication/styles';
import { OnClickPluginOpts } from 'lib/uPlotLib/plugins/onClickPlugin';
import { Widgets } from 'types/api/widgets/widget';

function TopLevelOperation({
	name,
	opName,
	topLevelOperationsIsError,
	topLevelOperationsError,
	onDragSelect,
	handleGraphClick,
	widget,
	topLevelOperationsIsLoading,
}: TopLevelOperationProps): JSX.Element {
	return (
		<ChartPanel testId={name}>
			{topLevelOperationsIsError ? (
				<Typography>
					{axios.isAxiosError(topLevelOperationsError)
						? topLevelOperationsError.response?.data
						: SOMETHING_WENT_WRONG}
				</Typography>
			) : (
				<GraphContainer>
					<Graph
						widget={widget}
						onClickHandler={handleGraphClick(opName)}
						onDragSelect={onDragSelect}
						isQueryEnabled={!topLevelOperationsIsLoading}
						version={ENTITY_VERSION_V4}
						enableDrillDown={SERVICE_DETAIL_DRILLDOWN_ENABLED}
					/>
				</GraphContainer>
			)}
		</ChartPanel>
	);
}

interface TopLevelOperationProps {
	name: string;
	opName: string;
	topLevelOperationsIsError: boolean;
	topLevelOperationsError: unknown;
	onDragSelect: (start: number, end: number) => void;
	handleGraphClick: (type: string) => OnClickPluginOpts['onClick'];
	widget: Widgets;
	topLevelOperationsIsLoading: boolean;
}

export default TopLevelOperation;
