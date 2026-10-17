import { ReactNode, useId } from 'react';
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from 'components/ui/sidebar';

interface NavGroupSectionProps {
	label: string;
	children: ReactNode;
}

function NavGroupSection({
	label,
	children,
}: NavGroupSectionProps): JSX.Element {
	const labelId = useId();

	return (
		<SidebarGroup className="tw:py-1">
			<SidebarGroupLabel
				id={labelId}
				className="tw:px-2.5 tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
			>
				{label}
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu aria-labelledby={labelId} className="tw:gap-0.5">
					{children}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

export default NavGroupSection;
