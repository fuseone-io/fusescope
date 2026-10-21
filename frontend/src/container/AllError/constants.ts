import { ExceptionColumn } from './types';

export const EXCEPTION_COLUMNS: ExceptionColumn[] = [
	{
		key: 'exceptionType',
		label: 'Exception type',
		sortable: true,
		align: 'left',
		filter: { key: 'exceptionType', placeholder: 'Search by exception type' },
		className: 'tw:w-[22%]',
	},
	{
		key: 'exceptionMessage',
		label: 'Error message',
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
		label: 'Last seen',
		sortable: true,
		align: 'left',
		className: 'tw:w-[130px]',
	},
	{
		key: 'firstSeen',
		label: 'First seen',
		sortable: true,
		align: 'left',
		className: 'tw:w-[130px]',
	},
	{
		key: 'serviceName',
		label: 'Service',
		sortable: true,
		align: 'left',
		filter: { key: 'serviceName', placeholder: 'Search by service' },
		className: 'tw:w-[17%]',
	},
];

export const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];

/** Day, month and time; the full timestamp is in the cell's title. */
export const SEEN_FORMAT = 'DD MMM, HH:mm:ss';
