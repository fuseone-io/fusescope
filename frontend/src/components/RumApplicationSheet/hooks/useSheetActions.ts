import { toast } from '@signozhq/ui/sonner';
import { RumtypesKeyOverlapDTO } from 'api/generated/services/fuseScope.schemas';

import { ApplicationFormValues } from '../types';
import { ApplicationSheetState } from './useApplicationSheet';

export interface SheetActions {
	submit: (values: ApplicationFormValues) => Promise<void>;
	/** Undefined in the create flow: a new application is not deleted from here. */
	remove?: () => Promise<void>;
	createKey: () => Promise<void>;
	rotateKey: (keyId: string, overlap: RumtypesKeyOverlapDTO) => Promise<void>;
	revokeKey: (keyId: string) => Promise<void>;
	addOrigin: (origin: string) => void;
}

/** What the sheet's buttons do; errors reach the caller, which shows them. */
export function useSheetActions(
	sheet: ApplicationSheetState,
	onClose: () => void,
	onDeleted?: () => void,
): SheetActions {
	const { applicationId, mutations } = sheet;
	const id = applicationId ?? '';

	const submit = async (values: ApplicationFormValues): Promise<void> => {
		if (!applicationId) {
			const created = await mutations.create(values);
			sheet.setCreated(created);
			sheet.setRevealed({ keyId: created.key.id, key: created.key.key });
			sheet.setTab('install');
			return;
		}
		await mutations.update(applicationId, values);
		sheet.setPendingOrigin(undefined);
		toast.success('Application saved');
		if (sheet.isNew) {
			sheet.setTab('install');
		}
	};

	const remove = async (): Promise<void> => {
		await mutations.remove(id);
		toast.success('Application deleted');
		onClose();
		onDeleted?.();
	};

	return {
		submit,
		remove: applicationId && !sheet.isNew ? remove : undefined,
		createKey: async (): Promise<void> => {
			const created = await mutations.createKey(id);
			sheet.setRevealed({ keyId: created.id, key: created.key });
		},
		rotateKey: async (keyId, overlap): Promise<void> => {
			const created = await mutations.rotateKey(id, keyId, overlap);
			sheet.setRevealed({ keyId: created.id, key: created.key });
		},
		revokeKey: (keyId): Promise<void> => mutations.revokeKey(id, keyId),
		addOrigin: (origin): void => {
			sheet.setPendingOrigin(origin);
			sheet.setTab('settings');
		},
	};
}
