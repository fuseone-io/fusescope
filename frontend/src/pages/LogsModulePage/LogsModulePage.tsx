import { useLocation } from 'react-use';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import history from 'lib/history';
import { ScrollText } from 'lucide-react';

import ROUTES from 'constants/routes';

import { logSaveView, logsExplorer, logsPipelines } from './constants';
import LogsRecordCountLine from './LogsRecordCountLine';

export default function LogsModulePage(): JSX.Element {
	const { pathname = '' } = useLocation();
	const isSavedViewEnabled = useSavedViewEnabled();

	const routes: TabRoutes[] = [
		logsExplorer,
		logsPipelines,
		...(isSavedViewEnabled ? [] : [logSaveView]),
	];

	return (
		<ModuleTabsLayout
			title="Logs"
			icon={<ScrollText />}
			description={
				pathname === ROUTES.LOGS_EXPLORER ? <LogsRecordCountLine /> : undefined
			}
			testId="logs-module-page"
			routes={routes}
			activeKey={pathname}
			history={history}
		/>
	);
}
