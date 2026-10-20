import { useAppContext } from 'providers/App/App';

import { apmSourceOf } from './source';
import { ApmSource } from './types';

export function useApmSource(): ApmSource {
	const { featureFlags } = useAppContext();
	return apmSourceOf(featureFlags);
}
