import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import { Bookmark, Compass, LayoutGrid, SlidersVertical } from 'lucide-react';
import ExplorerPage from 'container/MetricsExplorer/Explorer';
import SummaryPage from 'container/MetricsExplorer/Summary';
import VolumeControlTab from 'container/MetricsExplorer/VolumeControl/components/VolumeControlTab/VolumeControlTab';
import SaveView from 'pages/SaveView';

export const Summary: TabRoutes = {
	Component: SummaryPage,
	name: 'Summary',
	icon: <LayoutGrid />,
	route: ROUTES.METRICS_EXPLORER,
	key: ROUTES.METRICS_EXPLORER,
};

export const Explorer: TabRoutes = {
	Component: (): JSX.Element => <ExplorerPage />,
	name: 'Explorer',
	icon: <Compass />,
	route: ROUTES.METRICS_EXPLORER_EXPLORER,
	key: ROUTES.METRICS_EXPLORER_EXPLORER,
};

export const Views: TabRoutes = {
	Component: SaveView,
	name: 'Views',
	icon: <Bookmark />,
	route: ROUTES.METRICS_EXPLORER_VIEWS,
	key: ROUTES.METRICS_EXPLORER_VIEWS,
};

export const VolumeControl: TabRoutes = {
	Component: VolumeControlTab,
	name: 'Volume Control',
	icon: <SlidersVertical />,
	route: ROUTES.METRICS_EXPLORER_VOLUME_CONTROL,
	key: ROUTES.METRICS_EXPLORER_VOLUME_CONTROL,
};
