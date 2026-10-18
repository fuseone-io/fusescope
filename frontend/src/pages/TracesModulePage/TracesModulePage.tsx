import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import history from 'lib/history';
import { DraftingCompass } from 'lucide-react';

import { tracesExplorer, tracesFunnel, tracesSaveView } from './constants';

function TracesModulePage(): JSX.Element {
	const { pathname } = useLocation();
	const isSavedViewEnabled = useSavedViewEnabled();

	const routes: TabRoutes[] = [
		tracesExplorer,
		tracesFunnel(pathname),
		...(isSavedViewEnabled ? [] : [tracesSaveView]),
	].filter(Boolean) as TabRoutes[];

	const handleTabChange = (activeRoute: string): void => {
		if (activeRoute === ROUTES.TRACES_FUNNELS) {
			logEvent('Trace Funnels: visited from trace explorer page', {});
		}
	};

	return (
		<ModuleTabsLayout
			title="Traces"
			icon={<DraftingCompass />}
			testId="traces-module-page"
			routes={routes}
			activeKey={
				pathname.includes(ROUTES.TRACES_FUNNELS) ? ROUTES.TRACES_FUNNELS : pathname
			}
			history={history}
			onChangeHandler={handleTabChange}
		/>
	);
}

export default TracesModulePage;
