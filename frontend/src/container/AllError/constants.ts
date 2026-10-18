import { ExceptionColumn } from './types';

export const EXCEPTION_COLUMNS: ExceptionColumn[] = [
	{
		key: 'exceptionType',
		label: 'Exception Type',
		sortable: true,
		align: 'left',
		filter: { key: 'exceptionType', placeholder: 'Search By Exception' },
		className: 'tw:w-[18%]',
	},
	{
		key: 'exceptionMessage',
		label: 'Error Message',
		sortable: false,
		align: 'left',
	},
	{
		key: 'exceptionCount',
		label: 'Count',
		sortable: true,
		align: 'right',
		className: 'tw:w-20',
	},
	{
		key: 'lastSeen',
		label: 'Last Seen',
		sortable: true,
		align: 'left',
		className: 'tw:w-[140px]',
	},
	{
		key: 'firstSeen',
		label: 'First Seen',
		sortable: true,
		align: 'left',
		className: 'tw:w-[140px]',
	},
	{
		key: 'serviceName',
		label: 'Application',
		sortable: true,
		align: 'left',
		filter: { key: 'serviceName', placeholder: 'Search By Application' },
		className: 'tw:w-[15%]',
	},
];

export const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];
