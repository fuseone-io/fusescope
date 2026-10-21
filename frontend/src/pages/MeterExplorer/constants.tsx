import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import BreakDownPage from 'container/MeterExplorer/Breakdown/BreakDown';
import ExplorerPage from 'container/MeterExplorer/Explorer';
import { Bookmark, ChartColumn, Search } from 'lucide-react';
import SaveView from 'pages/SaveView';

import ViewsTabLabel from './ViewsTabLabel';

export const Explorer: TabRoutes = {
	Component: (): JSX.Element => <ExplorerPage />,
	name: 'Explorer',
	icon: <Search />,
	route: ROUTES.METER_EXPLORER,
	key: ROUTES.METER_EXPLORER,
};

export const Views: TabRoutes = {
	Component: SaveView,
	name: <ViewsTabLabel />,
	icon: <Bookmark />,
	route: ROUTES.METER_EXPLORER_VIEWS,
	key: ROUTES.METER_EXPLORER_VIEWS,
};

export const Meter: TabRoutes = {
	Component: BreakDownPage,
	name: 'Meter',
	icon: <ChartColumn />,
	route: ROUTES.METER,
	key: ROUTES.METER,
};
