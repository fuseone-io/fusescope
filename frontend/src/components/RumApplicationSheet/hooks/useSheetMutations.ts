import { useQueryClient } from 'react-query';
import {
	invalidateGetRUMApplication,
	invalidateListRUMApplicationKeys,
	invalidateListRUMApplications,
	useCreateRUMApplication,
	useCreateRUMApplicationKey,
	useDeleteRUMApplication,
	useRevokeRUMApplicationKey,
	useRotateRUMApplicationKey,
	useUpdateRUMApplication,
} from 'api/generated/services/rum';
import type {
	RumtypesGettableCreatedApplicationDTO,
	RumtypesGettableCreatedApplicationKeyDTO,
	RumtypesKeyOverlapDTO,
} from 'api/generated/services/fuseScope.schemas';

import { ApplicationFormValues } from '../types';
import { toPostableApplication, toUpdatableApplication } from '../utils/form';

export interface SheetMutations {
	create: (
		values: ApplicationFormValues,
	) => Promise<RumtypesGettableCreatedApplicationDTO>;
	update: (id: string, values: ApplicationFormValues) => Promise<void>;
	remove: (id: string) => Promise<void>;
	createKey: (id: string) => Promise<RumtypesGettableCreatedApplicationKeyDTO>;
	rotateKey: (
		id: string,
		keyId: string,
		overlap: RumtypesKeyOverlapDTO,
	) => Promise<RumtypesGettableCreatedApplicationKeyDTO>;
	revokeKey: (id: string, keyId: string) => Promise<void>;
	saving: boolean;
}

export function useSheetMutations(): SheetMutations {
	const queryClient = useQueryClient();
	const createApplication = useCreateRUMApplication();
	const updateApplication = useUpdateRUMApplication();
	const deleteApplication = useDeleteRUMApplication();
	const createKey = useCreateRUMApplicationKey();
	const rotateKey = useRotateRUMApplicationKey();
	const revokeKey = useRevokeRUMApplicationKey();

	const refreshApplication = async (id: string): Promise<void> => {
		await Promise.all([
			invalidateListRUMApplications(queryClient),
			invalidateGetRUMApplication(queryClient, { id }),
		]);
	};
	const refreshKeys = async (id: string): Promise<void> => {
		await invalidateListRUMApplicationKeys(queryClient, { id });
	};

	return {
		create: async (values) => {
			const { data } = await createApplication.mutateAsync({
				data: toPostableApplication(values),
			});
			await invalidateListRUMApplications(queryClient);
			return data;
		},
		update: async (id, values) => {
			await updateApplication.mutateAsync({
				pathParams: { id },
				data: toUpdatableApplication(values),
			});
			await refreshApplication(id);
		},
		remove: async (id) => {
			await deleteApplication.mutateAsync({ pathParams: { id } });
			await invalidateListRUMApplications(queryClient);
		},
		createKey: async (id) => {
			const { data } = await createKey.mutateAsync({ pathParams: { id } });
			await refreshKeys(id);
			return data;
		},
		rotateKey: async (id, keyId, overlap) => {
			const { data } = await rotateKey.mutateAsync({
				pathParams: { id, keyId },
				data: { overlap },
			});
			await refreshKeys(id);
			return data;
		},
		revokeKey: async (id, keyId) => {
			await revokeKey.mutateAsync({ pathParams: { id, keyId } });
			await refreshKeys(id);
		},
		saving:
			createApplication.isLoading ||
			updateApplication.isLoading ||
			deleteApplication.isLoading,
	};
}
