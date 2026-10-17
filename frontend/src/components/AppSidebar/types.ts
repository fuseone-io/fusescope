import type { ReactNode } from 'react';

export type NavBadge = 'Beta' | 'New' | 'Early Access';

export interface NavVisibility {
	isAdmin: boolean;
	isEditor: boolean;
	isCloudUser: boolean;
	isEnterpriseSelfHostedUser: boolean;
}

export interface NavItem {
	/** Route the item navigates to; also the key active-route matching resolves to. */
	key: string;
	/** Stable id stored in the NAV_SHORTCUTS preference. */
	itemKey: string;
	label: string;
	icon: ReactNode;
	badge?: NavBadge;
	/** Collapsed-rail tooltip; defaults to `label`. */
	tooltip?: string;
	isVisible?: (visibility: NavVisibility) => boolean;
}

export interface NavGroup {
	key: string;
	label: string;
	items: NavItem[];
}

export type HelpMenuEntry =
	| { type: 'separator'; key: string }
	| { type: 'label'; key: string; label: string }
	| {
			type: 'item';
			key: string;
			label: string;
			icon: ReactNode;
			url?: string;
	  };
