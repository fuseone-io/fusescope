import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import LLMObservabilityAttributeMapping from 'container/LLMObservability/AttributeMapping/LLMObservabilityAttributeMapping';
import ExplorerPage from 'container/LLMObservability/Explorer/Explorer';
import OverviewPage from 'container/LLMObservability/Overview/Overview';
import LLMObservabilityModelPricing from 'container/LLMObservability/Settings/ModelPricing/LLMObservabilityModelPricing';

export const Overview: TabRoutes = {
	Component: OverviewPage,
	name: 'Overview',
	route: ROUTES.AI_OBSERVABILITY_OVERVIEW,
	key: ROUTES.AI_OBSERVABILITY_OVERVIEW,
};

export const Explorer: TabRoutes = {
	Component: ExplorerPage,
	name: 'Explorer',
	route: ROUTES.AI_OBSERVABILITY_EXPLORER,
	key: ROUTES.AI_OBSERVABILITY_EXPLORER,
};

export const ModelPricing: TabRoutes = {
	Component: LLMObservabilityModelPricing,
	name: 'Model pricing',
	route: ROUTES.AI_OBSERVABILITY_CONFIGURATION,
	key: ROUTES.AI_OBSERVABILITY_CONFIGURATION,
};

export const AttributeMapping: TabRoutes = {
	Component: LLMObservabilityAttributeMapping,
	name: 'Attribute Mapping',
	route: ROUTES.AI_OBSERVABILITY_ATTRIBUTE_MAPPING,
	key: ROUTES.AI_OBSERVABILITY_ATTRIBUTE_MAPPING,
};
