import { useCallback, useEffect, useRef, useState } from 'react';

import { NavGroup } from '../types';

export const COLLAPSED_NAV_GROUPS_KEY = 'fusescope.sidebar.collapsedGroups';
export const SHORTCUTS_GROUP_KEY = 'shortcuts';

function readCollapsed(): string[] {
	try {
		const value: unknown = JSON.parse(
			window.localStorage.getItem(COLLAPSED_NAV_GROUPS_KEY) ?? '[]',
		);
		return Array.isArray(value)
			? value.filter((key): key is string => typeof key === 'string')
			: [];
	} catch {
		return [];
	}
}

function writeCollapsed(keys: string[]): void {
	try {
		window.localStorage.setItem(COLLAPSED_NAV_GROUPS_KEY, JSON.stringify(keys));
	} catch {
		// Storage unavailable: the state lasts for this session only.
	}
}

export interface CollapsedNavGroups {
	isOpen: (key: string) => boolean;
	setOpen: (key: string, open: boolean) => void;
}

/**
 * Per-group open state, persisted in localStorage. On reaching a route whose
 * item no open group shows, its group (not Shortcuts) is expanded.
 */
export function useCollapsedNavGroups(
	groups: NavGroup[],
	activeKey: string,
): CollapsedNavGroups {
	const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
	const handledKey = useRef<string | null>(null);

	const setOpen = useCallback((key: string, open: boolean): void => {
		setCollapsed((current) => {
			const next = current.filter((k) => k !== key);
			if (!open) {
				next.push(key);
			}
			writeCollapsed(next);
			return next;
		});
	}, []);

	useEffect(() => {
		if (handledKey.current === activeKey) {
			return;
		}
		handledKey.current = activeKey;
		const holding = groups.filter((group) =>
			group.items.some((item) => item.key === activeKey),
		);
		if (holding.some((group) => !collapsed.includes(group.key))) {
			return;
		}
		const home = holding.find((group) => group.key !== SHORTCUTS_GROUP_KEY);
		if (home) {
			setOpen(home.key, true);
		}
	}, [activeKey, groups, collapsed, setOpen]);

	const isOpen = useCallback(
		(key: string): boolean => !collapsed.includes(key),
		[collapsed],
	);

	return { isOpen, setOpen };
}
