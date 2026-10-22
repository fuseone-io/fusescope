import {
	useGetRUMApplication,
	useGetRUMApplicationStatus,
	useListRUMApplicationKeys,
} from 'api/generated/services/rum';
import type {
	RumtypesApplicationDTO,
	RumtypesGettableApplicationKeyDTO,
	RumtypesGettableApplicationStatusDTO,
} from 'api/generated/services/fuseScope.schemas';

export const STATUS_POLL_MS = 5000;

export interface SheetData {
	application?: RumtypesApplicationDTO;
	applicationLoading: boolean;
	keys: RumtypesGettableApplicationKeyDTO[];
	status?: RumtypesGettableApplicationStatusDTO;
}

/** The application, its keys and, while `pollStatus`, its setup status every few seconds. */
export function useSheetData(
	applicationId: string | undefined,
	pollStatus: boolean,
): SheetData {
	const id = applicationId ?? '';
	const enabled = Boolean(applicationId);
	const application = useGetRUMApplication(
		{ id },
		{ query: { enabled, refetchOnWindowFocus: false } },
	);
	const keys = useListRUMApplicationKeys(
		{ id },
		{ query: { enabled, refetchOnWindowFocus: false } },
	);
	const status = useGetRUMApplicationStatus(
		{ id },
		{
			query: {
				enabled: enabled && pollStatus,
				refetchInterval: pollStatus ? STATUS_POLL_MS : false,
				refetchOnWindowFocus: false,
			},
		},
	);
	return {
		application: application.data?.data,
		applicationLoading: enabled && application.isLoading,
		keys: keys.data?.data ?? [],
		status: status.data?.data,
	};
}
