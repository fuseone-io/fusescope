import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import history from 'lib/history';
import { Settings } from 'lucide-react';

import { getLogsSettingsRoute } from './config';

function LogsSettings(): JSX.Element {
	const { pathname } = useLocation();
	const { t } = useTranslation();

	const routes = useMemo(() => getLogsSettingsRoute(t), [t]);

	return (
		<ModuleTabsLayout
			title="Logs settings"
			icon={<Settings />}
			testId="logs-settings-page"
			routes={routes}
			activeKey={pathname}
			history={history}
			contentClassName="tw:px-4 tw:py-4 tw:md:px-6"
		/>
	);
}

export default LogsSettings;
