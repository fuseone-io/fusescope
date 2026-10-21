import { AlertmanagertypesMaintenanceStatusDTO } from 'api/generated/services/fuseScope.schemas';
import type { DefaultOptionType } from 'antd/es/select';
import { StatusTone } from 'components/PageTemplate/types';
import { ALL_TIME_ZONES } from 'utils/timeZoneUtil';

export const DOWNTIME_PAGE_SIZE = 5;

export const DOWNTIME_STATUS: Record<
	AlertmanagertypesMaintenanceStatusDTO,
	{ label: string; tone: StatusTone }
> = {
	[AlertmanagertypesMaintenanceStatusDTO.active]: {
		label: 'Active',
		tone: 'success',
	},
	[AlertmanagertypesMaintenanceStatusDTO.upcoming]: {
		label: 'Scheduled',
		tone: 'info',
	},
	[AlertmanagertypesMaintenanceStatusDTO.expired]: {
		label: 'Ended',
		tone: 'neutral',
	},
};

export const TZ_OPTIONS: DefaultOptionType[] = ALL_TIME_ZONES.map(
	(timezone: string) => ({
		label: timezone,
		value: timezone,
		key: timezone,
	}),
);
