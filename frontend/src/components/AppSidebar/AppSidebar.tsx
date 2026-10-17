import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
} from 'components/ui/sidebar';
import ROUTES from 'constants/routes';
import { useAIAssistantStore } from 'container/AIAssistant/store/useAIAssistantStore';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';
import { PackagePlus } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import HelpMenu from './components/HelpMenu';
import NavGroupSection from './components/NavGroupSection';
import NavMenuItem from './components/NavMenuItem';
import SidebarBrand from './components/SidebarBrand';
import UserMenu from './components/UserMenu';
import {
	AI_ASSISTANT_NAV_ITEM,
	NAV_BUTTON_CLASS,
	SETTINGS_NAV_ITEM,
} from './constants';
import { useNavigationShortcuts } from './hooks/useNavigationShortcuts';
import { useNavShortcuts } from './hooks/useNavShortcuts';
import { useSidebarNavigation } from './hooks/useSidebarNavigation';
import { useVisibleNavItems } from './hooks/useVisibleNavItems';
import { NavItem } from './types';
import { openRoute } from './utils';

/** FuseScope's main navigation; render inside `AppSidebarProvider`. */
function AppSidebar(): JSX.Element {
	const { user, trialInfo } = useAppContext();
	const { isCloudUser } = useGetTenantLicense();
	const isAIAssistantEnabled = useIsAIAssistantEnabled();
	const aiConversationId = useAIAssistantStore((s) => s.activeConversationId);
	const { activeKey, pathname, urlFor, navigate } = useSidebarNavigation();
	const { groups, integrations, pinnable } = useVisibleNavItems();
	const { shortcuts, isShortcut, toggleShortcut } = useNavShortcuts(pinnable);
	useNavigationShortcuts(navigate);

	const isWorkspaceBlocked = trialInfo?.workSpaceBlock || false;
	const showNewSource = isCloudUser && user.role !== USER_ROLES.VIEWER;

	const logClick = (item: NavItem): void => {
		void logEvent('Sidebar V2: Menu clicked', {
			menuRoute: item.key,
			menuLabel: item.label,
		});
	};

	const renderItem = (item: NavItem, scope: string): JSX.Element => (
		<NavMenuItem
			key={`${scope}-${item.itemKey}`}
			item={item}
			href={urlFor(item.key)}
			isActive={activeKey === item.key}
			isDisabled={isWorkspaceBlocked}
			onNavigate={(event): void => {
				logClick(item);
				navigate(item.key, event);
			}}
			shortcut={{
				isShortcut: isShortcut(item),
				onToggle: (): void => toggleShortcut(item),
			}}
		/>
	);

	const aiPath = aiConversationId
		? ROUTES.AI_ASSISTANT.replace(':conversationId', aiConversationId)
		: AI_ASSISTANT_NAV_ITEM.key;

	return (
		<Sidebar
			collapsible="icon"
			data-testid="app-sidebar"
			className="fs-ui tw:absolute tw:h-full tw:font-sans tw:text-sm"
		>
			<nav
				aria-label="Main navigation"
				className="tw:flex tw:h-full tw:min-h-0 tw:flex-col"
			>
				<SidebarBrand
					homeUrl={urlFor(ROUTES.HOME)}
					onHome={(event: MouseEvent): void => navigate(ROUTES.HOME, event)}
				/>
				<SidebarContent className="tw:gap-1 tw:py-2 tw:overflow-x-hidden tw:[scrollbar-width:thin] tw:group-data-[collapsible=icon]:overflow-y-auto tw:group-data-[collapsible=icon]:[scrollbar-width:none]">
					{showNewSource && (
						<SidebarGroup className="tw:py-1">
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										variant="outline"
										tooltip="New source"
										disabled={isWorkspaceBlocked}
										className={NAV_BUTTON_CLASS}
										onClick={(event): void => {
											void logEvent('Sidebar: Menu clicked', {
												menuRoute: ROUTES.GET_STARTED_WITH_CLOUD,
												menuLabel: 'Get Started',
											});
											openRoute(ROUTES.GET_STARTED_WITH_CLOUD, event);
										}}
									>
										<PackagePlus />
										<span>New source</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroup>
					)}
					{shortcuts.length > 0 && (
						<NavGroupSection label="Shortcuts">
							{shortcuts.map((item) => renderItem(item, 'shortcut'))}
						</NavGroupSection>
					)}
					{groups.map((group) => (
						<NavGroupSection key={group.key} label={group.label}>
							{group.items.map((item) => renderItem(item, group.key))}
						</NavGroupSection>
					))}
				</SidebarContent>
				<SidebarFooter className="tw:gap-1 tw:pb-3">
					<SidebarMenu className="tw:gap-0.5">
						{isAIAssistantEnabled && (
							<NavMenuItem
								item={AI_ASSISTANT_NAV_ITEM}
								href={aiPath}
								isActive={activeKey === AI_ASSISTANT_NAV_ITEM.key}
								isDisabled={isWorkspaceBlocked}
								onNavigate={(event): void => {
									logClick(AI_ASSISTANT_NAV_ITEM);
									openRoute(aiPath, event);
								}}
							/>
						)}
						{integrations && renderItem(integrations, 'footer')}
						<HelpMenu />
						<NavMenuItem
							item={SETTINGS_NAV_ITEM}
							href={urlFor(ROUTES.SETTINGS)}
							isActive={pathname.startsWith(ROUTES.SETTINGS)}
							isDisabled={isWorkspaceBlocked}
							onNavigate={(event): void => {
								logClick(SETTINGS_NAV_ITEM);
								navigate(ROUTES.SETTINGS, event);
							}}
						/>
					</SidebarMenu>
					<SidebarSeparator className="tw:mx-0" />
					<UserMenu />
				</SidebarFooter>
			</nav>
			<SidebarRail />
		</Sidebar>
	);
}

export default AppSidebar;
