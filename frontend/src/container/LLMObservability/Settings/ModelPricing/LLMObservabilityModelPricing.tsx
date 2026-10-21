import { useEffect } from 'react';
import logEvent from 'api/common/logEvent';
import { useListUnmappedLLMModels } from 'api/generated/services/llmpricingrules';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { parseAsStringEnum, useQueryState } from 'nuqs';

import {
	MODEL_COSTS_TAB,
	type ModelPricingTab,
	TAB_KEY,
	UNPRICED_MODELS_TAB,
} from './constants';
import ModelCostTabPanel from './ModelCostTabPanel';
import UnpricedModelsTab from './UnpricedModelsTab';

function LLMObservabilityModelPricing(): JSX.Element {
	const [activeTab, setActiveTab] = useQueryState(
		TAB_KEY,
		parseAsStringEnum<ModelPricingTab>([
			MODEL_COSTS_TAB,
			UNPRICED_MODELS_TAB,
		]).withDefault(MODEL_COSTS_TAB),
	);

	// Count powers the tab badge; deduped with the tab's own fetch by react-query.
	const { data } = useListUnmappedLLMModels();
	const unpricedCount = data?.data?.items?.length ?? 0;

	useEffect(() => {
		void logEvent('AI Observability Model Pricing: Page visited', {});
	}, []);

	return (
		<div
			className="tw:flex tw:flex-col tw:gap-4 tw:p-4 tw:md:p-6"
			data-testid="llm-observability-model-pricing-page"
		>
			<SegmentedControl<ModelPricingTab>
				label="Pricing list"
				value={activeTab}
				onChange={(tab): void => {
					void setActiveTab(tab);
				}}
				className="tw:self-start"
				options={[
					{
						value: MODEL_COSTS_TAB,
						label: 'Model costs',
						testId: 'model-costs-tab',
					},
					{
						value: UNPRICED_MODELS_TAB,
						label: 'Unpriced models',
						testId: 'unpriced-models-tab',
						count: unpricedCount > 0 ? unpricedCount : undefined,
						countTone: 'warning',
						countTestId: 'unpriced-models-count',
					},
				]}
			/>
			{activeTab === MODEL_COSTS_TAB ? (
				<ModelCostTabPanel />
			) : (
				<UnpricedModelsTab />
			)}
		</div>
	);
}

export default LLMObservabilityModelPricing;
