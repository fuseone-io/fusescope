import { useCallback } from 'react';
import getLocalStorageApi from 'api/browser/localstorage/get';
import setLocalStorageApi from 'api/browser/localstorage/set';
import { useUpdateUserPreference } from 'api/generated/services/preferences';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { useNotifications } from 'hooks/useNotifications';
import { useAppContext } from 'providers/App/App';
import { showErrorNotification } from 'utils/error';

function pinnedFromLocalStorage(): boolean {
	try {
		return getLocalStorageApi(USER_PREFERENCES.SIDENAV_PINNED) === 'true';
	} catch {
		return false;
	}
}

/**
 * Expanded ⇔ the `sidenav_pinned` preference. Until preferences load, the last
 * value written to localStorage avoids a layout jump.
 */
export function useSidebarPinnedPreference(): {
	isPinned: boolean;
	setPinned: (pinned: boolean) => void;
} {
	const {
		userPreferences,
		isFetchingUserPreferences,
		updateUserPreferenceInContext,
	} = useAppContext();
	const { notifications } = useNotifications();
	const { mutate } = useUpdateUserPreference({
		mutation: {
			onError: (error) => showErrorNotification(notifications, error),
		},
	});

	const isPinned = isFetchingUserPreferences
		? pinnedFromLocalStorage()
		: userPreferences?.find(
				(preference) => preference.name === USER_PREFERENCES.SIDENAV_PINNED,
			)?.value === true;

	const setPinned = useCallback(
		(pinned: boolean): void => {
			setLocalStorageApi(USER_PREFERENCES.SIDENAV_PINNED, String(pinned));
			updateUserPreferenceInContext({
				name: USER_PREFERENCES.SIDENAV_PINNED,
				description: USER_PREFERENCES.SIDENAV_PINNED,
				valueType: 'boolean',
				defaultValue: false,
				allowedValues: [],
				allowedScopes: ['user'],
				value: pinned,
			});
			mutate({
				pathParams: { name: USER_PREFERENCES.SIDENAV_PINNED },
				data: { value: pinned },
			});
		},
		[mutate, updateUserPreferenceInContext],
	);

	return { isPinned, setPinned };
}
