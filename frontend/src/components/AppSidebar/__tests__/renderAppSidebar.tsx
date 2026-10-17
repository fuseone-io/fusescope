import { ReactNode, useMemo, useState } from 'react';
import { mockMatchMedia } from 'components/ui/__tests__/mockMatchMedia';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { KeyboardHotkeysProvider } from 'hooks/hotkeys/useKeyboardHotkeys';
import { AppContext, useAppContext } from 'providers/App/App';
import { IAppContext } from 'providers/App/types';
import { CmdKProvider } from 'providers/cmdKProvider';
import { render, RenderResult } from 'tests/test-utils';
import { UserPreference } from 'types/api/preferences/preference';

import SidebarToggle from 'components/AppHeader/components/SidebarToggle';

import AppSidebar from '../AppSidebar';
import AppSidebarProvider from '../AppSidebarProvider';

export function preference(name: string, value: unknown): UserPreference {
	return {
		name,
		description: name,
		valueType: typeof value,
		defaultValue: false,
		allowedValues: [],
		allowedScopes: ['user'],
		value,
	};
}

/** Keeps preferences in state, as the real AppProvider does. */
function StatefulPreferences({
	initial,
	onUpdate,
	children,
}: {
	initial: UserPreference[];
	onUpdate: (preference: UserPreference) => void;
	children: ReactNode;
}): JSX.Element {
	const outer = useAppContext();
	const [userPreferences, setUserPreferences] = useState(initial);

	const value = useMemo<IAppContext>(
		() => ({
			...outer,
			userPreferences,
			updateUserPreferenceInContext: (updated: UserPreference): void => {
				onUpdate(updated);
				setUserPreferences((current) => [
					...current.filter((p) => p.name !== updated.name),
					updated,
				]);
			},
		}),
		[outer, userPreferences, onUpdate],
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

interface RenderOptions {
	pinned?: boolean;
	route?: string;
	role?: string;
	preferences?: UserPreference[];
	overrides?: Partial<IAppContext>;
	onPreferenceUpdate?: (preference: UserPreference) => void;
	/** Rendered next to the sidebar; the toggle lives in the app header. */
	content?: ReactNode;
}

export function renderAppSidebar({
	pinned = false,
	route = '/home',
	role = 'ADMIN',
	preferences = [],
	overrides = {},
	onPreferenceUpdate = jest.fn(),
	content = <SidebarToggle />,
}: RenderOptions = {}): RenderResult {
	mockMatchMedia();

	return render(
		<StatefulPreferences
			initial={[
				preference(USER_PREFERENCES.SIDENAV_PINNED, pinned),
				...preferences,
			]}
			onUpdate={onPreferenceUpdate}
		>
			<CmdKProvider>
				<KeyboardHotkeysProvider>
					<AppSidebarProvider hasSidebar>
						<AppSidebar />
						{content}
					</AppSidebarProvider>
				</KeyboardHotkeysProvider>
			</CmdKProvider>
		</StatefulPreferences>,
		undefined,
		{ role, initialRoute: route, appContextOverrides: overrides },
	);
}

export function sidebarState(): string | null {
	return (
		document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') ??
		null
	);
}
