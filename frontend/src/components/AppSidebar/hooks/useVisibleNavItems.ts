import { useMemo } from 'react';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import { INTEGRATIONS_NAV_ITEM, NAV_GROUPS } from '../constants';
import { NavGroup, NavItem, NavVisibility } from '../types';

export interface VisibleNavItems {
	groups: NavGroup[];
	/** Shown in the footer; null when the license or role hides it. */
	integrations: NavItem | null;
	/** Every visible item a user can add to shortcuts. */
	pinnable: NavItem[];
}

function isVisible(item: NavItem, visibility: NavVisibility): boolean {
	return item.isVisible ? item.isVisible(visibility) : true;
}

export function useVisibleNavItems(): VisibleNavItems {
	const { user } = useAppContext();
	const { isCloudUser, isEnterpriseSelfHostedUser } = useGetTenantLicense();

	return useMemo(() => {
		const visibility: NavVisibility = {
			isAdmin: user.role === USER_ROLES.ADMIN,
			isEditor: user.role === USER_ROLES.EDITOR,
			isCloudUser,
			isEnterpriseSelfHostedUser,
		};
		const groups = NAV_GROUPS.map((group) => ({
			...group,
			items: group.items.filter((item) => isVisible(item, visibility)),
		})).filter((group) => group.items.length > 0);
		const integrations = isVisible(INTEGRATIONS_NAV_ITEM, visibility)
			? INTEGRATIONS_NAV_ITEM
			: null;
		const pinnable = groups.flatMap((group) => group.items);
		if (integrations) {
			pinnable.push(integrations);
		}
		return { groups, integrations, pinnable };
	}, [user.role, isCloudUser, isEnterpriseSelfHostedUser]);
}
