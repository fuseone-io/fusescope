import {
	// eslint-disable-next-line no-restricted-imports
	createContext,
	Dispatch,
	ReactNode,
	SetStateAction,
	useCallback,
	// eslint-disable-next-line no-restricted-imports
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { theme as antdTheme, ThemeConfig } from 'antd';
import get from 'api/browser/localstorage/get';
import set from 'api/browser/localstorage/set';
import { LOCALSTORAGE } from 'constants/localStorage';

import { THEME_MODE } from './constant';

export const ThemeContext = createContext({
	theme: THEME_MODE.DARK,
	toggleTheme: (): void => {},
	autoSwitch: false,
	setAutoSwitch: ((): void => {}) as Dispatch<SetStateAction<boolean>>,
	setTheme: ((): void => {}) as Dispatch<SetStateAction<string>>,
});

// Hook to detect system theme preference
export const useSystemTheme = (): 'light' | 'dark' => {
	const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

	useEffect(() => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

		const handler = (e: MediaQueryListEvent): void => {
			setSystemTheme(e.matches ? 'dark' : 'light');
		};

		mediaQuery.addEventListener('change', handler);
		return (): void => mediaQuery.removeEventListener('change', handler);
	}, []);

	return systemTheme;
};

export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
	const [theme, setThemeState] = useState(
		get(LOCALSTORAGE.THEME) || THEME_MODE.DARK,
	);
	const [autoSwitch, setAutoSwitch] = useState(
		get(LOCALSTORAGE.THEME_AUTO_SWITCH) === 'true',
	);
	const systemTheme = useSystemTheme();

	// Handle auto-switch functionality
	useEffect(() => {
		if (autoSwitch) {
			const newTheme = systemTheme === 'dark' ? THEME_MODE.DARK : THEME_MODE.LIGHT;
			if (newTheme !== theme) {
				setThemeState(newTheme);
				set(LOCALSTORAGE.THEME, newTheme);
			}
		}
	}, [systemTheme, autoSwitch, theme]);

	// Save auto-switch preference
	useEffect(() => {
		set(LOCALSTORAGE.THEME_AUTO_SWITCH, autoSwitch.toString());
	}, [autoSwitch]);

	const toggleTheme = useCallback((): void => {
		if (theme === THEME_MODE.LIGHT) {
			setThemeState(THEME_MODE.DARK);
			set(LOCALSTORAGE.THEME, THEME_MODE.DARK);
		} else {
			setThemeState(THEME_MODE.LIGHT);
			set(LOCALSTORAGE.THEME, THEME_MODE.LIGHT);
		}
		set(LOCALSTORAGE.THEME_ANALYTICS_V1, '');
	}, [theme]);

	const setTheme = useCallback(
		(newTheme: SetStateAction<string>): void => {
			const themeValue =
				typeof newTheme === 'function' ? newTheme(theme) : newTheme;
			setThemeState(themeValue);
			set(LOCALSTORAGE.THEME, themeValue);
		},
		[theme],
	);

	const value = useMemo(
		() => ({
			theme,
			toggleTheme,
			autoSwitch,
			setAutoSwitch,
			setTheme,
		}),
		[theme, toggleTheme, autoSwitch, setAutoSwitch, setTheme],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

interface ThemeProviderProps {
	children: ReactNode;
}

interface ThemeMode {
	theme: string;
	toggleTheme: () => void;
	autoSwitch: boolean;
	setAutoSwitch: Dispatch<SetStateAction<boolean>>;
	setTheme: (newTheme: string) => void;
}

export const useThemeMode = (): ThemeMode => {
	const { theme, toggleTheme, autoSwitch, setAutoSwitch, setTheme } =
		useContext(ThemeContext);

	return { theme, toggleTheme, autoSwitch, setAutoSwitch, setTheme };
};

export const useIsDarkMode = (): boolean => {
	const { theme } = useContext(ThemeContext);

	return theme === THEME_MODE.DARK;
};

const ANTD_PALETTE = {
	dark: {
		bgBase: '#0A1628',
		bgContainer: '#111827',
		bgHover: '#1F2937',
		border: '#2B3648',
		text: '#B8BFCC',
	},
	light: {
		bgBase: '#FFFFFF',
		bgContainer: '#FFFFFF',
		bgHover: '#ECEEF2',
		border: '#D8DCE4',
		text: '#111827',
	},
};

export const useThemeConfig = (): ThemeConfig => {
	const isDarkMode = useIsDarkMode();
	const palette = isDarkMode ? ANTD_PALETTE.dark : ANTD_PALETTE.light;
	const primary = isDarkMode ? '#3D8BE0' : '#0F5FB8';

	return {
		algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			borderRadius: 6,
			borderRadiusLG: 8,
			borderRadiusSM: 4,
			borderRadiusXS: 2,
			fontFamily: 'Inter',
			fontSize: 13,
			colorPrimary: primary,
			colorBgBase: palette.bgBase,
			colorBgContainer: palette.bgContainer,
			colorBorder: palette.border,
			colorBorderSecondary: palette.border,
			colorLink: primary,
			colorPrimaryText: primary,
		},
		components: {
			Dropdown: {
				colorBgElevated: palette.bgContainer,
				controlItemBgHover: palette.bgHover,
				colorText: palette.text,
				fontSize: 12,
			},
			Select: {
				colorBgElevated: palette.bgContainer,
				controlItemBgHover: palette.bgHover,
				boxShadowSecondary: isDarkMode
					? '4px 10px 16px 2px rgba(0, 0, 0, 0.30)'
					: '0 6px 16px rgba(17, 24, 39, 0.08)',
				colorText: palette.text,
				fontSize: 12,
			},
			Button: {
				paddingInline: 12,
				fontSize: 12,
			},
			Input: {
				colorBorder: palette.border,
			},
			Breadcrumb: {
				separatorMargin: 4,
			},
		},
	};
};

export default useThemeMode;
