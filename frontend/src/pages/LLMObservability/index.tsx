import { useLocation } from 'react-router-dom';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import history from 'lib/history';
import { Brain } from 'lucide-react';

import {
	AttributeMapping,
	Explorer,
	ModelPricing,
	Overview,
} from './constants';

const routes: TabRoutes[] = [
	Overview,
	Explorer,
	ModelPricing,
	AttributeMapping,
];

function LLMObservabilityPage(): JSX.Element {
	const { pathname } = useLocation();

	return (
		<ModuleTabsLayout
			title="AI Observability"
			icon={<Brain />}
			routes={routes}
			activeKey={pathname}
			history={history}
			testId="llm-observability-page"
		/>
	);
}

export default LLMObservabilityPage;
