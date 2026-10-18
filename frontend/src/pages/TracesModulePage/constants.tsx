import { matchPath } from 'react-router-dom';
import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import SaveView from 'pages/SaveView';
import TracesExplorer from 'pages/TracesExplorer';
import TracesFunnelDetails from 'pages/TracesFunnelDetails';
import TracesFunnels from 'pages/TracesFunnels';

export const tracesExplorer: TabRoutes = {
	Component: (): JSX.Element => <TracesExplorer />,
	name: 'Explorer',
	route: ROUTES.TRACES_EXPLORER,
	key: ROUTES.TRACES_EXPLORER,
};

export const tracesFunnel = (pathname: string): TabRoutes => ({
	Component: (): JSX.Element => {
		const isFunnelDetails = matchPath(pathname, ROUTES.TRACES_FUNNELS_DETAIL);

		return isFunnelDetails ? <TracesFunnelDetails /> : <TracesFunnels />;
	},
	name: 'Funnels',
	route: ROUTES.TRACES_FUNNELS,
	key: ROUTES.TRACES_FUNNELS,
});

export const tracesSaveView: TabRoutes = {
	Component: SaveView,
	name: 'Views',
	route: ROUTES.TRACES_SAVE_VIEWS,
	key: ROUTES.TRACES_SAVE_VIEWS,
};
