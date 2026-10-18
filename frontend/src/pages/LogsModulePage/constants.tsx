import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import LogsExplorer from 'pages/LogsExplorer';
import Pipelines from 'pages/Pipelines';
import SaveView from 'pages/SaveView';

export const logsExplorer: TabRoutes = {
	Component: (): JSX.Element => <LogsExplorer />,
	name: 'Explorer',
	route: ROUTES.LOGS,
	key: ROUTES.LOGS,
};

export const logsPipelines: TabRoutes = {
	Component: (): JSX.Element => <Pipelines />,
	name: 'Pipelines',
	route: ROUTES.LOGS_PIPELINES,
	key: ROUTES.LOGS_PIPELINES,
};

export const logSaveView: TabRoutes = {
	Component: SaveView,
	name: 'Views',
	route: ROUTES.LOGS_SAVE_VIEWS,
	key: ROUTES.LOGS_SAVE_VIEWS,
};
