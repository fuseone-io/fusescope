import { ReactNode } from 'react';

export interface PageHeaderMetaItem {
	key: string;
	content: ReactNode;
}

export interface PageTab {
	value: string;
	label: ReactNode;
	content: ReactNode;
	badge?: ReactNode;
	disabled?: boolean;
	title?: string;
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export type SortDirection = 'asc' | 'desc';

export interface SortState<Key extends string> {
	key: Key;
	direction: SortDirection;
}
