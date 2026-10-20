import { FeatureKeys } from 'constants/features';

import { ApmSource } from './types';

interface FlagLike {
	name: string;
	active: boolean;
}

/** Span metrics when `use_span_metrics` is on, otherwise the traces themselves. */
export function apmSourceOf(
	featureFlags: FlagLike[] | null | undefined,
): ApmSource {
	const enabled = featureFlags?.find(
		(flag) => flag.name === FeatureKeys.USE_SPAN_METRICS,
	)?.active;
	return enabled ? 'span-metrics' : 'traces';
}
