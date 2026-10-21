import { useMemo } from 'react';
import type { AlertmanagertypesRecurrenceDTO } from 'api/generated/services/fuseScope.schemas';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import dayjs from 'dayjs';

const TIME_FORMAT = DATE_TIME_FORMATS.TIME;
const DATE_FORMAT = DATE_TIME_FORMATS.ORDINAL_DATE;
const ORDINAL_FORMAT = DATE_TIME_FORMATS.ORDINAL_ONLY;

interface ScheduleWindow {
	startTime?: dayjs.Dayjs | null;
	endTime?: dayjs.Dayjs | null;
	recurrence?: AlertmanagertypesRecurrenceDTO;
}

/** The sentences under the start and end pickers that read the schedule back. */
export function useScheduleInfoText(
	formData: ScheduleWindow,
	recurrenceType: string,
): { startTimeText: string; endTimeText: string } {
	const startTimeText = useMemo((): string => {
		const startTime = formData.startTime;
		if (!startTime) {
			return '';
		}

		const daysOfWeek = formData.recurrence?.repeatOn;

		const formattedStartTime = startTime.format(TIME_FORMAT);
		const formattedStartDate = startTime.format(DATE_FORMAT);
		const ordinalFormat = startTime.format(ORDINAL_FORMAT);

		const formattedDaysOfWeek = daysOfWeek?.join(', ');
		switch (recurrenceType) {
			case 'daily':
				return `Scheduled from ${formattedStartDate}, daily starting at ${formattedStartTime}.`;
			case 'monthly':
				return `Scheduled from ${formattedStartDate}, monthly on the ${ordinalFormat} starting at ${formattedStartTime}.`;
			case 'weekly':
				return `Scheduled from ${formattedStartDate}, weekly ${
					formattedDaysOfWeek ? `on [${formattedDaysOfWeek}]` : ''
				} starting at ${formattedStartTime}`;
			default:
				return `Scheduled for ${formattedStartDate} starting at ${formattedStartTime}.`;
		}
	}, [formData, recurrenceType]);

	const endTimeText = useMemo((): string => {
		const endTime = formData.endTime;
		if (!endTime) {
			return '';
		}

		const formattedEndTime = endTime.format(TIME_FORMAT);
		const formattedEndDate = endTime.format(DATE_FORMAT);
		return `Scheduled to end maintenance on ${formattedEndDate} at ${formattedEndTime}.`;
	}, [formData]);

	return { startTimeText, endTimeText };
}
