import { ReactNode, useId } from 'react';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from 'components/ui/collapsible';
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	useSidebar,
} from 'components/ui/sidebar';
import { ChevronDown } from 'lucide-react';

const LABEL_CLASS =
	'tw:h-6 tw:px-2 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-ink-subtle tw:uppercase tw:group-data-[collapsible=icon]:-mt-6';

interface NavGroupSectionProps {
	label: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

/** A collapsible group; the icon rail ignores collapsing and shows every item. */
function NavGroupSection({
	label,
	open,
	onOpenChange,
	children,
}: NavGroupSectionProps): JSX.Element {
	const labelId = useId();
	const { state, isMobile } = useSidebar();
	const isRail = state === 'collapsed' && !isMobile;

	return (
		<Collapsible open={isRail || open} onOpenChange={onOpenChange}>
			<SidebarGroup className="tw:p-0">
				{isRail ? (
					<SidebarGroupLabel id={labelId} className={LABEL_CLASS}>
						{label}
					</SidebarGroupLabel>
				) : (
					<SidebarGroupLabel
						asChild
						className={`${LABEL_CLASS} tw:w-full tw:cursor-pointer tw:gap-1 tw:hover:text-foreground tw:[&>svg]:size-3.5`}
					>
						<CollapsibleTrigger id={labelId}>
							{label}
							<ChevronDown
								aria-hidden
								className="tw:ml-auto tw:transition-transform tw:[[data-state=closed]>&]:-rotate-90"
							/>
						</CollapsibleTrigger>
					</SidebarGroupLabel>
				)}
				<CollapsibleContent>
					<SidebarGroupContent>
						<SidebarMenu aria-labelledby={labelId} className="tw:gap-px">
							{children}
						</SidebarMenu>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}

export default NavGroupSection;
