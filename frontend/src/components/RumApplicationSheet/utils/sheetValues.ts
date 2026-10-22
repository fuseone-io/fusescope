import type {
	RumtypesApplicationDTO,
	RumtypesGettableApplicationKeyDTO,
} from 'api/generated/services/fuseScope.schemas';

import { RevealedKey } from '../hooks/useApplicationSheet';
import { ApplicationFormValues } from '../types';
import { DEFAULT_FORM_VALUES, formFromApplication } from './form';
import { activeKey, KEY_PREFIX, keyPlaceholder } from './keys';

/** The settings form's starting values, with a refused origin to add. */
export function initialFormValues(
	application: RumtypesApplicationDTO | undefined,
	pendingOrigin: string | undefined,
): ApplicationFormValues {
	const values = application
		? formFromApplication(application)
		: DEFAULT_FORM_VALUES;
	if (!pendingOrigin || values.allowedOrigins.includes(pendingOrigin)) {
		return values;
	}
	return {
		...values,
		allowedOrigins: [...values.allowedOrigins, pendingOrigin],
	};
}

/** The key the snippet shows: plaintext while this sheet knows it, else a placeholder. */
export function snippetKey(
	keys: RumtypesGettableApplicationKeyDTO[],
	revealed: RevealedKey | undefined,
): string {
	const active = activeKey(keys);
	if (revealed && (!active || active.id === revealed.keyId)) {
		return revealed.key;
	}
	return active ? keyPlaceholder(active.last4) : `${KEY_PREFIX}…`;
}
