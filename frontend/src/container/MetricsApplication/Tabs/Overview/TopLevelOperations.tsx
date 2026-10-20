import { Typography } from '@signozhq/ui/typography';
import axios from 'axios';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { ENTITY_VERSION_V4 } from 'constants/app';
import Graph from 'container/WidgetCard/Card';
import ChartPanel from 'container/MetricsApplication/components/ChartPanel';
import { GraphContainer } from 'container/MetricsApplication/styles';
import { PanelPointMenu } from 'container/WidgetCard/Panels/pointMenu.types';
import { Widgets } from 'types/api/widgets/widget';

function TopLevelOperation({
	name,
	topLevelOperationsIsError,
	topLevelOperationsError,
	onDragSelect,
	pointMenu,
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
						pointMenu={pointMenu}
						onDragSelect={onDragSelect}
						isQueryEnabled={!topLevelOperationsIsLoading}
						version={ENTITY_VERSION_V4}
					/>
				</GraphContainer>
			)}
		</ChartPanel>
	);
}

interface TopLevelOperationProps {
	name: string;
	topLevelOperationsIsError: boolean;
	topLevelOperationsError: unknown;
	onDragSelect: (start: number, end: number) => void;
	pointMenu: PanelPointMenu;
	widget: Widgets;
	topLevelOperationsIsLoading: boolean;
}

export default TopLevelOperation;
