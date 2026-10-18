import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import BreakDownPage from 'container/MeterExplorer/Breakdown/BreakDown';
import ExplorerPage from 'container/MeterExplorer/Explorer';
import SaveView from 'pages/SaveView';

export const Explorer: TabRoutes = {
	Component: (): JSX.Element => <ExplorerPage />,
	name: 'Explorer',
	route: ROUTES.METER_EXPLORER,
	key: ROUTES.METER_EXPLORER,
};

export const Views: TabRoutes = {
	Component: SaveView,
	name: 'Views',
	route: ROUTES.METER_EXPLORER_VIEWS,
	key: ROUTES.METER_EXPLORER_VIEWS,
};

export const Meter: TabRoutes = {
	Component: BreakDownPage,
	name: 'Meter',
	route: ROUTES.METER,
	key: ROUTES.METER,
};
