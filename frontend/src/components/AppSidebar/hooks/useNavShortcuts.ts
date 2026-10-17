import { useCallback, useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import { useUpdateUserPreference } from 'api/generated/services/preferences';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { useNotifications } from 'hooks/useNotifications';
import { useAppContext } from 'providers/App/App';
import { showErrorNotification } from 'utils/error';

import { NavItem } from '../types';

export interface NavShortcuts {
	shortcuts: NavItem[];
	isShortcut: (item: NavItem) => boolean;
	toggleShortcut: (item: NavItem) => void;
}

/** User-picked items listed first, stored by `itemKey` in `nav_shortcuts`. */
export function useNavShortcuts(items: NavItem[]): NavShortcuts {
	const { userPreferences, updateUserPreferenceInContext } = useAppContext();
	const { notifications } = useNotifications();
	const { mutate } = useUpdateUserPreference({
		mutation: {
			onError: (error) => showErrorNotification(notifications, error),
		},
	});

	const keys = useMemo((): string[] => {
		const value = userPreferences?.find(
			(preference) => preference.name === USER_PREFERENCES.NAV_SHORTCUTS,
		)?.value;
		return Array.isArray(value)
			? value.filter((key): key is string => typeof key === 'string')
			: [];
	}, [userPreferences]);

	const shortcuts = useMemo(
		() =>
			keys
				.map((key) => items.find((item) => item.itemKey === key))
				.filter((item): item is NavItem => item !== undefined),
		[items, keys],
	);

	const isShortcut = useCallback(
		(item: NavItem): boolean => keys.includes(item.itemKey),
		[keys],
	);

	const toggleShortcut = useCallback(
		(item: NavItem): void => {
			const pinned = keys.includes(item.itemKey);
			const next = pinned
				? keys.filter((key) => key !== item.itemKey)
				: [...keys, item.itemKey];

			void logEvent(`Sidebar V2: Menu item ${pinned ? 'unpinned' : 'pinned'}`, {
				menuRoute: item.key,
				menuLabel: item.label,
			});
			updateUserPreferenceInContext({
				name: USER_PREFERENCES.NAV_SHORTCUTS,
				description: USER_PREFERENCES.NAV_SHORTCUTS,
				valueType: 'array',
				defaultValue: false,
				allowedValues: [],
				allowedScopes: ['user'],
				value: next,
			});
			mutate({
				pathParams: { name: USER_PREFERENCES.NAV_SHORTCUTS },
				data: { value: next },
			});
		},
		[keys, mutate, updateUserPreferenceInContext],
	);

	return { shortcuts, isShortcut, toggleShortcut };
}
