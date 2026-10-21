import type { DefaultOptionType } from 'antd/es/select';
import type {
	AlertmanagertypesPlannedMaintenanceDTO,
	AlertmanagertypesRecurrenceDTO,
} from 'api/generated/services/fuseScope.schemas';
import type dayjs from 'dayjs';

export type AlertRuleScope = 'all' | 'specific';

export type DowntimeSchedulesTableData =
	AlertmanagertypesPlannedMaintenanceDTO & {
		alertOptions: DefaultOptionType[];
	};

export interface PlannedDowntimeFormData {
	name: string;
	startTime: dayjs.Dayjs | null;
	endTime: dayjs.Dayjs | null;
	recurrence?: AlertmanagertypesRecurrenceDTO;
	alertRuleScope: AlertRuleScope;
	alertRules: DefaultOptionType[];
	recurrenceSelect?: AlertmanagertypesRecurrenceDTO;
	timezone?: string;
	scope?: string;
}
