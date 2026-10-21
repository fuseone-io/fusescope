import { useEffect, useState } from 'react';
import { useMutation } from 'react-query';
import setLocalStorageApi from 'api/browser/localstorage/set';
import logEvent from 'api/common/logEvent';
import updateUserPreference from 'api/v1/user/preferences/name/update';
import { AxiosError } from 'axios';
import { USER_PREFERENCES } from 'constants/userPreferences';
import useThemeMode, { useIsDarkMode, useSystemTheme } from 'hooks/useDarkMode';
import { useNotifications } from 'hooks/useNotifications';
import { useAppContext } from 'providers/App/App';
import { UserPreference } from 'types/api/preferences/preference';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Switch } from 'components/ui/switch';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import { showErrorNotification } from 'utils/error';

import LicenseSection from './LicenseSection';
import PreferenceRow from './PreferenceRow';
import ThemeSelector from './ThemeSelector';
import TimezoneAdaptation from './TimezoneAdaptation/TimezoneAdaptation';
import UserInfo from './UserInfo';

function MySettings(): JSX.Element {
	const isDarkMode = useIsDarkMode();
	const { userPreferences, updateUserPreferenceInContext } = useAppContext();
	const { toggleTheme, autoSwitch, setAutoSwitch } = useThemeMode();
	const systemTheme = useSystemTheme();
	const { notifications } = useNotifications();

	const [sideNavPinned, setSideNavPinned] = useState(false);

	useEffect(() => {
		if (userPreferences) {
			setSideNavPinned(
				userPreferences.find(
					(preference) => preference.name === USER_PREFERENCES.SIDENAV_PINNED,
				)?.value as boolean,
			);
		}
	}, [userPreferences]);

	const {
		mutate: updateUserPreferenceMutation,
		isLoading: isUpdatingUserPreference,
	} = useMutation(updateUserPreference, {
		onSuccess: () => {
			// No need to do anything on success since we've already updated the state optimistically
		},
		onError: (error) => {
			showErrorNotification(notifications, error as AxiosError);
		},
	});

	const [theme, setTheme] = useState(() => {
		if (autoSwitch) {
			return 'auto';
		}
		return isDarkMode ? 'dark' : 'light';
	});

	const handleThemeChange = (value: string): void => {
		logEvent('Account Settings: Theme Changed', {
			theme: value,
		});
		setTheme(value);

		if (value === 'auto') {
			setAutoSwitch(true);
		} else {
			setAutoSwitch(false);
			// Only toggle if the current theme is different from the target
			const targetIsDark = value === 'dark';
			if (targetIsDark !== isDarkMode) {
				toggleTheme();
			}
		}
	};

	useEffect(() => {
		if (autoSwitch) {
			setTheme('auto');
			return;
		}

		if (isDarkMode) {
			setTheme('dark');
		} else {
			setTheme('light');
		}
	}, [autoSwitch, isDarkMode]);

	const handleSideNavPinnedChange = (checked: boolean): void => {
		logEvent('Account Settings: Sidebar Pinned Changed', {
			pinned: checked,
		});
		// Optimistically update the UI
		setSideNavPinned(checked);

		// Save to localStorage immediately for instant feedback
		setLocalStorageApi(USER_PREFERENCES.SIDENAV_PINNED, checked.toString());

		// Update the context immediately
		const save = {
			name: USER_PREFERENCES.SIDENAV_PINNED,
			value: checked,
		};
		updateUserPreferenceInContext(save as UserPreference);

		// Make the API call in the background
		updateUserPreferenceMutation(
			{
				name: USER_PREFERENCES.SIDENAV_PINNED,
				value: checked,
			},
			{
				onError: (error) => {
					// Revert the state if the API call fails
					setSideNavPinned(!checked);
					updateUserPreferenceInContext({
						name: USER_PREFERENCES.SIDENAV_PINNED,
						value: !checked,
					} as UserPreference);
					// Also revert localStorage
					setLocalStorageApi(USER_PREFERENCES.SIDENAV_PINNED, (!checked).toString());
					showErrorNotification(notifications, error as AxiosError);
				},
			},
		);
	};

	return (
		<SettingsPageShell
			testId="my-settings"
			title="Account"
			description="Manage your account settings."
			narrow
		>
			<ContentPanel testId="user-info-section" bodyClassName="user-info-container">
				<UserInfo />
			</ContentPanel>

			<ContentPanel
				title="User Preferences"
				subtitle="Tailor the FuseScope console to work according to your needs."
				testId="user-preference-section"
				divided
			>
				<div className="user-preference-section-content tw:divide-y tw:divide-border">
					<PreferenceRow
						className="theme-selector"
						title="Select your theme"
						description="Select if FuseScope's appearance should be light, dark, or automatically follow your system preference"
						control={<ThemeSelector value={theme} onChange={handleThemeChange} />}
					>
						{autoSwitch && (
							<div className="auto-theme-info tw:rounded-md tw:bg-surface-sunken tw:px-3 tw:py-2 tw:text-xs tw:text-muted-foreground">
								Currently following system theme:{' '}
								<strong className="tw:font-semibold tw:text-primary-ink">
									{systemTheme === 'dark' ? 'Dark' : 'Light'}
								</strong>
							</div>
						)}
					</PreferenceRow>

					<TimezoneAdaptation />

					<PreferenceRow
						title="Keep the primary sidebar always open"
						description="Keep the primary sidebar always open by default, unless collapsed with the keyboard shortcut"
						control={
							<Switch
								aria-label="Keep the primary sidebar always open"
								checked={sideNavPinned}
								onCheckedChange={handleSideNavPinnedChange}
								disabled={isUpdatingUserPreference}
								data-testid="side-nav-pinned-switch"
							/>
						}
					/>
				</div>
			</ContentPanel>

			<LicenseSection />
		</SettingsPageShell>
	);
}

export default MySettings;
