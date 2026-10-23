import { useQueryClient } from 'react-query';
import {
	invalidateGetRUMApplication,
	invalidateListRUMSourceMaps,
	useDeleteRUMSourceMap,
	useDeleteRUMSourceMaps,
	useUpdateRUMApplication,
	useUploadRUMSourceMaps,
} from 'api/generated/services/rum';
import type {
	RumtypesApplicationDTO,
	RumtypesRejectedSourceMapDTO,
	RumtypesSourceMapSettingsDTO,
} from 'api/generated/services/fuseScope.schemas';
import { apiErrorMessage } from 'lib/rum/apiError';

import { formFromApplication, toUpdatableApplication } from '../utils/form';
import { mapPath } from '../utils/sourceMaps';

export interface UploadResult {
	uploaded: number;
	rejected: RumtypesRejectedSourceMapDTO[];
}

export interface SourceMapActions {
	deleteRelease: (release: string) => Promise<void>;
	deleteFile: (fileId: string) => Promise<void>;
	/** One request per file, each named by its URL path; failures are reported per file. */
	upload: (
		files: File[],
		release: string,
		prefix: string,
	) => Promise<UploadResult>;
	saveSettings: (settings: RumtypesSourceMapSettingsDTO) => Promise<void>;
	savingSettings: boolean;
}

export function useSourceMapActions(
	application: RumtypesApplicationDTO,
): SourceMapActions {
	const queryClient = useQueryClient();
	const { id } = application;
	const deleteRelease = useDeleteRUMSourceMaps();
	const deleteFile = useDeleteRUMSourceMap();
	const uploadMaps = useUploadRUMSourceMaps();
	const update = useUpdateRUMApplication();
	const refresh = async (): Promise<void> => {
		await invalidateListRUMSourceMaps(queryClient, { id });
	};

	return {
		deleteRelease: async (release) => {
			await deleteRelease.mutateAsync({ pathParams: { id }, params: { release } });
			await refresh();
		},
		deleteFile: async (fileId) => {
			await deleteFile.mutateAsync({ pathParams: { id, fileId } });
			await refresh();
		},
		upload: async (files, release, prefix) => {
			const result: UploadResult = { uploaded: 0, rejected: [] };
			for (const file of files) {
				const path = mapPath(prefix, file.name);
				try {
					const { data } = await uploadMaps.mutateAsync({
						pathParams: { id },
						params: { release },
						data: { file: new File([file], path, { type: 'application/json' }) },
					});
					result.uploaded += data.files?.length ?? 0;
					result.rejected.push(...(data.rejected ?? []));
				} catch (error) {
					result.rejected.push({ path, reason: apiErrorMessage(error) });
				}
			}
			await refresh();
			return result;
		},
		saveSettings: async (settings) => {
			await update.mutateAsync({
				pathParams: { id },
				data: {
					...toUpdatableApplication(formFromApplication(application)),
					sourceMaps: settings,
				},
			});
			await Promise.all([
				invalidateGetRUMApplication(queryClient, { id }),
				refresh(),
			]);
		},
		savingSettings: update.isLoading,
	};
}
