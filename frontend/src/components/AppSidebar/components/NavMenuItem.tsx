import { MouseEvent } from 'react';
import { Badge } from 'components/ui/badge';
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from 'components/ui/sidebar';
import { cn } from 'lib/utils';
import { Pin, PinOff } from 'lucide-react';

import { NAV_BUTTON_CLASS } from '../constants';
import { useFooterTooltip } from '../hooks/useFooterTooltip';
import { NavItem } from '../types';

interface NavMenuItemProps {
	item: NavItem;
	href: string;
	isActive: boolean;
	isDisabled: boolean;
	onNavigate: (event: MouseEvent) => void;
	shortcut?: { isShortcut: boolean; onToggle: () => void };
	/** Icon button named by an always-on tooltip, for the footer row. */
	iconOnly?: boolean;
}

function NavMenuItem({
	item,
	href,
	isActive,
	isDisabled,
	onNavigate,
	shortcut,
	iconOnly,
}: NavMenuItemProps): JSX.Element {
	const label = item.tooltip ?? item.label;
	const footerTooltip = useFooterTooltip(label);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				isActive={isActive}
				tooltip={iconOnly ? footerTooltip : label}
				className={cn(NAV_BUTTON_CLASS, iconOnly && 'tw:size-8')}
			>
				<a
					href={href}
					aria-current={isActive ? 'page' : undefined}
					aria-disabled={isDisabled || undefined}
					data-testid={`nav-item-${item.itemKey}`}
					onClick={(event): void => {
						event.preventDefault();
						if (!isDisabled) {
							onNavigate(event);
						}
					}}
				>
					{item.icon}
					<span className={iconOnly ? 'tw:sr-only' : 'tw:flex-1 tw:truncate'}>
						{item.label}
					</span>
					{item.badge && (
						<Badge
							variant="secondary"
							className="tw:bg-primary-soft tw:px-1.5 tw:py-0 tw:text-[10px] tw:leading-4 tw:text-primary-ink tw:group-data-[collapsible=icon]:hidden"
						>
							{item.badge}
						</Badge>
					)}
				</a>
			</SidebarMenuButton>
			{shortcut && (
				<SidebarMenuAction
					showOnHover
					aria-label={`${shortcut.isShortcut ? 'Remove' : 'Add'} ${item.label} ${shortcut.isShortcut ? 'from' : 'to'} shortcuts`}
					title={shortcut.isShortcut ? 'Remove from shortcuts' : 'Add to shortcuts'}
					className="tw:text-muted-foreground! tw:hover:bg-muted! tw:hover:text-foreground! tw:[&>svg]:size-3.5"
					onClick={shortcut.onToggle}
				>
					{shortcut.isShortcut ? <PinOff /> : <Pin />}
				</SidebarMenuAction>
			)}
		</SidebarMenuItem>
	);
}

NavMenuItem.defaultProps = {
	shortcut: undefined,
	iconOnly: false,
};

export default NavMenuItem;
