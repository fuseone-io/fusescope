import { MouseEvent } from 'react';
import { Badge } from 'components/ui/badge';
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from 'components/ui/sidebar';
import { Pin, PinOff } from 'lucide-react';

import { NAV_BUTTON_CLASS } from '../constants';
import { NavItem } from '../types';

interface NavMenuItemProps {
	item: NavItem;
	href: string;
	isActive: boolean;
	isDisabled: boolean;
	onNavigate: (event: MouseEvent) => void;
	shortcut?: { isShortcut: boolean; onToggle: () => void };
}

function NavMenuItem({
	item,
	href,
	isActive,
	isDisabled,
	onNavigate,
	shortcut,
}: NavMenuItemProps): JSX.Element {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				isActive={isActive}
				tooltip={item.tooltip ?? item.label}
				className={NAV_BUTTON_CLASS}
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
					<span className="tw:flex-1 tw:truncate">{item.label}</span>
					{item.badge && (
						<Badge
							variant="secondary"
							className="tw:bg-primary-soft tw:text-primary-ink tw:group-data-[collapsible=icon]:hidden"
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
					className="tw:top-2 tw:text-muted-foreground! tw:hover:bg-muted! tw:hover:text-foreground!"
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
};

export default NavMenuItem;
