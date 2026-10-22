import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from 'components/ui/sidebar';
import ROUTES from 'constants/routes';
import { ArrowUpRight, LifeBuoy } from 'lucide-react';
import { openInNewTab } from 'utils/navigation';

import { NAV_BUTTON_CLASS } from '../constants';
import { useFooterTooltip } from '../hooks/useFooterTooltip';
import { useHelpMenuEntries } from '../hooks/useHelpMenuEntries';
import { HelpMenuEntry } from '../types';
import { openRoute } from '../utils';

const LABEL = 'Help & Support';

function HelpMenu(): JSX.Element {
	const entries = useHelpMenuEntries();
	const { isMobile } = useSidebar();
	const tooltip = useFooterTooltip(LABEL);

	const select = (
		entry: Extract<HelpMenuEntry, { type: 'item' }>,
		event: MouseEvent,
	): void => {
		void logEvent('Help Popover: Item clicked', {
			menuRoute: entry.key,
			menuLabel: entry.label,
		});
		if (entry.url) {
			openInNewTab(entry.url);
			return;
		}
		switch (entry.key) {
			case 'invite-collaborators':
				openRoute(`${ROUTES.MEMBERS_SETTINGS}?invite=true`, event);
				break;
			case 'chat-support':
				if (window.pylon) {
					window.Pylon('show');
				}
				break;
			default:
		}
	};

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<SidebarMenuButton
						tooltip={tooltip}
						data-testid="help-support-nav-item"
						className={`${NAV_BUTTON_CLASS} tw:size-8`}
					>
						<LifeBuoy />
						<span className="tw:sr-only">{LABEL}</span>
					</SidebarMenuButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side={isMobile ? 'top' : 'right'}
					align="end"
					sideOffset={8}
					className="tw:min-w-56"
				>
					{entries.map((entry) => {
						if (entry.type === 'separator') {
							return <DropdownMenuSeparator key={entry.key} />;
						}
						if (entry.type === 'label') {
							return (
								<DropdownMenuLabel
									key={entry.key}
									className="tw:text-xs tw:font-medium tw:tracking-wide tw:text-muted-foreground tw:uppercase"
								>
									{entry.label}
								</DropdownMenuLabel>
							);
						}
						return (
							<DropdownMenuItem
								key={entry.key}
								onClick={(event): void => select(entry, event)}
							>
								{entry.icon}
								<span className="tw:flex-1 tw:truncate">{entry.label}</span>
								{entry.url && <ArrowUpRight className="tw:ml-auto" aria-hidden />}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
}

export default HelpMenu;
