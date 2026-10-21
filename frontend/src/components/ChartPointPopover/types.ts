import { ReactNode } from 'react';

export interface ChartPointAction {
	key: string;
	label: string;
	icon?: ReactNode;
	onSelect: () => void;
}

/** Where the time marker sits, in px from its positioned container. */
export interface ChartPointAnchor {
	left: number;
	top: number;
	height: number;
}
