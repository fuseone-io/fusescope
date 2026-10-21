import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import history from 'lib/history';
import { ChartArea } from 'lucide-react';

import { Explorer, Meter, Views } from './constants';

function MeterExplorerPage(): JSX.Element {
	const isSavedViewEnabled = useSavedViewEnabled();

	const routes: TabRoutes[] = [
		Meter,
		Explorer,
		...(isSavedViewEnabled ? [] : [Views]),
	];

	return (
		<ModuleTabsLayout
			title="Cost Meter"
			icon={<ChartArea />}
			description="Ingested logs, spans and metric datapoints — aggregated per hour, billed per UTC day"
			routes={routes}
			activeKey={Meter.key}
			history={history}
			testId="meter-explorer-page"
		/>
	);
}

export default MeterExplorerPage;
