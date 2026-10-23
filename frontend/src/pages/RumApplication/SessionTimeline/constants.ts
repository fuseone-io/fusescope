import { EventKindFilter } from './types';

export const KIND_FILTERS: { value: EventKindFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'views', label: 'Views' },
	{ value: 'actions', label: 'Actions' },
	{ value: 'requests', label: 'Requests' },
	{ value: 'errors', label: 'Errors' },
	{ value: 'vitals', label: 'Vitals' },
];
