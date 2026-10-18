import { OrderBy } from 'types/api/errors/getAll';

export type ColumnFilterKey = 'exceptionType' | 'serviceName';

export interface ExceptionColumn {
	key: OrderBy | 'exceptionMessage';
	label: string;
	sortable: boolean;
	align: 'left' | 'right';
	filter?: { key: ColumnFilterKey; placeholder: string };
	className?: string;
}
