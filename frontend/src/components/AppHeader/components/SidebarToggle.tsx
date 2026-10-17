import { Kbd } from 'components/ui/kbd';
import { SidebarTrigger, useSidebar } from 'components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { getUserOperatingSystem, UserOperatingSystem } from 'utils/getUserOS';

function SidebarToggle(): JSX.Element {
	const { open } = useSidebar();
	const shortcut =
		getUserOperatingSystem() === UserOperatingSystem.MACOS ? '⌘B' : 'Ctrl+B';

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<SidebarTrigger
					data-testid="app-sidebar-trigger"
					aria-expanded={open}
					className="tw:size-8 tw:shrink-0 tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground tw:[&_svg]:size-4.5 tw:[&_svg]:stroke-[1.5]"
				/>
			</TooltipTrigger>
			<TooltipContent side="bottom" align="start">
				<span>{open ? 'Collapse sidebar' : 'Expand sidebar'}</span>
				<Kbd>{shortcut}</Kbd>
			</TooltipContent>
		</Tooltip>
	);
}

export default SidebarToggle;
