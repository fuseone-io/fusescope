import { MouseEvent, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { routeConfig } from 'container/SideNav/config';
import { buildNavUrl, getQueryString } from 'container/SideNav/helper';
import { getActiveMenuKeyFromPath } from 'container/SideNav/sideNav.utils';
import history from 'lib/history';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

export interface SidebarNavigation {
	activeKey: string;
	pathname: string;
	/** The route plus the query params `routeConfig` carries across pages. */
	urlFor: (key: string) => string;
	/** `url` defaults to `urlFor(key)`; nothing happens when already on `key`. */
	navigate: (key: string, event: MouseEvent | null, url?: string) => void;
}

export function useSidebarNavigation(): SidebarNavigation {
	const { pathname, search } = useLocation();

	const activeKey = useMemo(
		() => getActiveMenuKeyFromPath(pathname),
		[pathname],
	);

	const urlFor = useCallback(
		(key: string): string =>
			buildNavUrl(
				key,
				getQueryString(routeConfig[key] || [], new URLSearchParams(search)),
			),
		[search],
	);

	const navigate = useCallback(
		(key: string, event: MouseEvent | null, url = urlFor(key)): void => {
			if (pathname === key) {
				return;
			}
			if (event && isModifierKeyPressed(event)) {
				openInNewTab(url);
			} else {
				history.push(url, { from: pathname });
			}
		},
		[pathname, urlFor],
	);

	return { activeKey, pathname, urlFor, navigate };
}
