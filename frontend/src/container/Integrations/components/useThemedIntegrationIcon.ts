import { useIsDarkMode } from 'hooks/useDarkMode';

import { LIGHT_THEME_ICONS } from '../constants';

export function useThemedIntegrationIcon(): (
	id: string,
	icon: string,
) => string {
	const isDarkMode = useIsDarkMode();

	return (id, icon) => (isDarkMode ? icon : (LIGHT_THEME_ICONS[id] ?? icon));
}
