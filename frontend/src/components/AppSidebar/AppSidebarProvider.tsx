import { CSSProperties, ReactNode, useCallback, useEffect } from 'react';
import logEvent from 'api/common/logEvent';
import { SidebarProvider } from 'components/ui/sidebar';
import { GlobalShortcuts } from 'constants/shortcuts/globalShortcuts';
import { useKeyboardHotkeys } from 'hooks/hotkeys/useKeyboardHotkeys';
import { cn } from 'lib/utils';

import { useSidebarPinnedPreference } from './hooks/useSidebarPinnedPreference';

const SIDEBAR_WIDTHS = {
	'--sidebar-width': '15rem',
	'--sidebar-width-icon': '3rem',
} as CSSProperties;

function ignoreToggle(): void {}

interface AppSidebarProviderProps {
	/** False on pages rendered without the sidebar: no toggle shortcuts there. */
	hasSidebar: boolean;
	className?: string;
	children: ReactNode;
}

/**
 * The layout row holding `AppSidebar` and the page. Collapsing is explicit —
 * the trigger, Ctrl/⌘+B or Shift+B — and persisted as `sidenav_pinned`.
 */
function AppSidebarProvider({
	hasSidebar,
	className,
	children,
}: AppSidebarProviderProps): JSX.Element {
	const { isPinned, setPinned } = useSidebarPinnedPreference();
	const { registerShortcut, deregisterShortcut } = useKeyboardHotkeys();

	const handleShiftB = useCallback((): void => {
		void logEvent('Global Shortcut: Sidebar Toggle', {
			previousState: isPinned,
			newState: !isPinned,
		});
		setPinned(!isPinned);
	}, [isPinned, setPinned]);

	useEffect(() => {
		if (!hasSidebar) {
			return undefined;
		}
		registerShortcut(GlobalShortcuts.ToggleSidebar, handleShiftB);
		return (): void => deregisterShortcut(GlobalShortcuts.ToggleSidebar);
	}, [hasSidebar, registerShortcut, deregisterShortcut, handleShiftB]);

	return (
		<SidebarProvider
			open={isPinned}
			onOpenChange={hasSidebar ? setPinned : ignoreToggle}
			style={SIDEBAR_WIDTHS}
			className={cn('tw:min-h-0', className)}
		>
			{children}
		</SidebarProvider>
	);
}

AppSidebarProvider.defaultProps = {
	className: undefined,
};

export default AppSidebarProvider;
