import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import history from 'lib/history';
import { Boxes } from 'lucide-react';

import { Hosts, Kubernetes } from './constants';

const routes = [Hosts, Kubernetes];

export default function InfrastructureMonitoringPage(): JSX.Element {
	return (
		<ModuleTabsLayout
			title="Infrastructure"
			icon={<Boxes />}
			routes={routes}
			activeKey={Hosts.key}
			history={history}
			testId="infra-monitoring-page"
		/>
	);
}
