import { RoutingPolicyDetailsFormState } from './types';

export const INITIAL_ROUTING_POLICY_DETAILS_FORM_STATE: RoutingPolicyDetailsFormState =
	{
		name: '',
		expression: '',
		channels: [],
		description: '',
	};

/** Name, expression, channels, updated and the row actions. */
export const ROUTING_POLICY_COLUMN_COUNT = 5;
