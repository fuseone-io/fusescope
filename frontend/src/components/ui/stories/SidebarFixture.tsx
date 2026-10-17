import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from 'components/ui/collapsible';
import { ScrollArea } from 'components/ui/scroll-area';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from 'components/ui/sidebar';
import {
	Activity,
	Bell,
	ChevronRight,
	LayoutDashboard,
	ScrollText,
	Waypoints,
} from 'lucide-react';

const NAV = [
	{ title: 'Services', icon: Activity },
	{ title: 'Traces', icon: Waypoints },
	{ title: 'Logs', icon: ScrollText },
	{ title: 'Dashboards', icon: LayoutDashboard },
] as const;

const ALERT_PAGES = ['Rules', 'Triggered', 'Planned downtime'] as const;

export default function SidebarFixture(): JSX.Element {
	return (
		<div className="fs-ui tw:font-sans">
			<SidebarProvider>
				<Sidebar collapsible="icon">
					<SidebarHeader>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton size="lg" tooltip="FuseScope">
									<span className="tw:font-semibold">FuseScope</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarHeader>
					<SidebarContent>
						<SidebarGroup>
							<SidebarGroupLabel>Observe</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{NAV.map(({ title, icon: Icon }) => (
										<SidebarMenuItem key={title}>
											<SidebarMenuButton tooltip={title} isActive={title === 'Services'}>
												<Icon />
												<span>{title}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
									<Collapsible defaultOpen className="tw:group/collapsible">
										<SidebarMenuItem>
											<CollapsibleTrigger asChild>
												<SidebarMenuButton tooltip="Alerts">
													<Bell />
													<span>Alerts</span>
													<ChevronRight className="tw:ml-auto tw:transition-transform tw:group-data-[state=open]/collapsible:rotate-90" />
												</SidebarMenuButton>
											</CollapsibleTrigger>
											<CollapsibleContent>
												<SidebarMenuSub>
													{ALERT_PAGES.map((page) => (
														<SidebarMenuSubItem key={page}>
															<SidebarMenuSubButton href="#">
																<span>{page}</span>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													))}
												</SidebarMenuSub>
											</CollapsibleContent>
										</SidebarMenuItem>
									</Collapsible>
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</SidebarContent>
					<SidebarFooter>
						<span className="tw:px-2 tw:text-xs tw:text-ink-subtle">v0.0.0</span>
					</SidebarFooter>
					<SidebarRail />
				</Sidebar>
				<SidebarInset>
					<header className="tw:flex tw:h-12 tw:items-center tw:gap-2 tw:border-b tw:px-4">
						<SidebarTrigger data-testid="sidebar-trigger" />
						<span className="tw:text-sm tw:text-muted-foreground">Services</span>
					</header>
					<ScrollArea className="tw:h-64 tw:p-4">
						<p className="tw:text-sm">
							Toggle the sidebar with the trigger, Ctrl+B or ⌘+B.
						</p>
					</ScrollArea>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
