import { useCallback, useState } from 'react';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	createDowntimeSchedule,
	updateDowntimeScheduleByID,
} from 'api/generated/services/downtimeschedules';
import type {
	AlertmanagertypesPostablePlannedMaintenanceDTO,
	RenderErrorResponseDTO,
} from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { useNotifications } from 'hooks/useNotifications';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';

import { PlannedDowntimeFormData } from './types';

interface UseSaveDowntimeArgs {
	id?: string;
	isEditMode: boolean;
	setIsOpen: (open: boolean) => void;
	refetchAllSchedules: () => void;
}

/** Creates or updates a downtime schedule from the submitted form values. */
export function useSaveDowntime({
	id,
	isEditMode,
	setIsOpen,
	refetchAllSchedules,
}: UseSaveDowntimeArgs): {
	saveLoading: boolean;
	saveHandler: (values: PlannedDowntimeFormData) => Promise<void>;
} {
	const [saveLoading, setSaveLoading] = useState(false);
	const { notifications } = useNotifications();
	const { showErrorModal } = useErrorModal();

	const saveHandler = useCallback(
		async (values: PlannedDowntimeFormData) => {
			const { startTime, timezone } = values;
			if (!startTime || !timezone) {
				// unreachable: required fields should always be present on submitting.
				return;
			}
			const data: AlertmanagertypesPostablePlannedMaintenanceDTO = {
				alertIds:
					values.alertRuleScope === 'all'
						? []
						: (values.alertRules
								.map((alert) => alert.value)
								.filter((alert) => alert !== undefined) as string[]),
				name: values.name,
				scope: values.scope,
				schedule: {
					startTime: startTime.format(),
					endTime: values.endTime?.format(),
					timezone,
					recurrence: values.recurrence,
				},
			};

			setSaveLoading(true);
			try {
				if (isEditMode && id) {
					await updateDowntimeScheduleByID({ id: id }, data);
				} else {
					await createDowntimeSchedule(data);
				}
				setIsOpen(false);
				notifications.success({
					message: 'Success',
					description: isEditMode
						? 'Schedule updated successfully'
						: 'Schedule created successfully',
				});
				refetchAllSchedules();
			} catch (e: unknown) {
				showErrorModal(
					convertToApiError(e as AxiosError<RenderErrorResponseDTO>) as APIError,
				);
			}
			setSaveLoading(false);
		},
		[
			id,
			isEditMode,
			notifications,
			refetchAllSchedules,
			setIsOpen,
			showErrorModal,
		],
	);

	return { saveLoading, saveHandler };
}
