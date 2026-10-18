import { MouseEvent, ReactNode } from 'react';
import logEvent from 'api/common/logEvent';
import { Logout } from 'api/utils';
import { Avatar, AvatarFallback } from 'components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from 'components/ui/sidebar';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { Building2, Keyboard, LogOut, Shield, Tag, User } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { isKnownVersion } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import {
	FUSESCOPE_RELEASES_URL,
	NAV_BUTTON_CLASS,
	WORKSPACE_LOCKED_TOOLTIP,
} from '../constants';
import { useVersionInfo } from '../hooks/useVersionInfo';
import { formatRole, getInitials, openRoute } from '../utils';

type UserMenuKey =
	| 'workspace'
	| 'account'
	| 'license'
	| 'keyboard-shortcuts'
	| 'logout';

const LABELS: Record<UserMenuKey, string> = {
	workspace: 'Workspace Settings',
	account: 'Account Settings',
	license: 'Manage License',
	'keyboard-shortcuts': 'Keyboard Shortcuts',
	logout: 'Sign out',
};

const ROUTE_BY_KEY: Record<Exclude<UserMenuKey, 'logout'>, string> = {
	workspace: ROUTES.SETTINGS,
	account: ROUTES.MY_SETTINGS,
	license: ROUTES.LIST_LICENSES,
	'keyboard-shortcuts': ROUTES.SHORTCUTS,
};

const LOCKED_REASON_ID = 'user-menu-workspace-locked';

function releaseNotesUrl(version: string): string {
	const tag = version.startsWith('v') ? version : `v${version}`;
	return `${FUSESCOPE_RELEASES_URL}/tag/${tag}`;
}

function UserMenu(): JSX.Element {
	const { user, trialInfo } = useAppContext();
	const { isEnterpriseSelfHostedUser, isCommunityEnterpriseUser } =
		useGetTenantLicense();
	const { isMobile } = useSidebar();
	const { currentVersion, latestVersion, isUpdateAvailable } = useVersionInfo();
	const isWorkspaceBlocked = trialInfo?.workSpaceBlock || false;
	const name = user.displayName || user.email;

	const select = (key: UserMenuKey, event: MouseEvent): void => {
		void logEvent('Settings Popover: Item clicked', {
			menuRoute: key,
			menuLabel: LABELS[key],
		});
		if (key === 'logout') {
			void Logout();
			return;
		}
		openRoute(ROUTE_BY_KEY[key], event);
	};

	const row = (
		key: Exclude<UserMenuKey, 'logout'>,
		icon: ReactNode,
		testId: string,
	): JSX.Element => (
		<DropdownMenuItem
			data-testid={testId}
			onClick={(event): void => select(key, event)}
		>
			{icon}
			{LABELS[key]}
		</DropdownMenuItem>
	);

	return (
		<SidebarMenu className="tw:min-w-0 tw:flex-1">
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							tooltip={name}
							data-testid="user-menu-trigger"
							className={`${NAV_BUTTON_CLASS} tw:h-10 tw:px-1.5 tw:group-data-[collapsible=icon]:justify-center`}
						>
							<Avatar size="sm" className="tw:size-6">
								<AvatarFallback className="tw:bg-primary-soft tw:text-[10px] tw:font-semibold tw:text-primary-ink">
									{getInitials(user.displayName, user.email)}
								</AvatarFallback>
							</Avatar>
							<span className="tw:grid tw:flex-1 tw:text-left tw:leading-tight tw:group-data-[collapsible=icon]:hidden">
								<span className="tw:truncate tw:text-[13px] tw:text-foreground">
									{name}
								</span>
								<span className="tw:truncate tw:text-[11px] tw:font-normal tw:text-subtle-foreground">
									{formatRole(user.role)}
								</span>
							</span>
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side={isMobile ? 'bottom' : 'right'}
						align="end"
						sideOffset={8}
						className="tw:min-w-60"
					>
						<DropdownMenuLabel
							data-testid="logged-in-as-nav-item"
							className="tw:flex tw:flex-col tw:gap-0.5"
						>
							<span className="tw:text-xs tw:font-normal tw:text-muted-foreground">
								Logged in as
							</span>
							<span className="tw:truncate">{user.email}</span>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								data-testid="workspace-settings-nav-item"
								disabled={isWorkspaceBlocked}
								aria-describedby={isWorkspaceBlocked ? LOCKED_REASON_ID : undefined}
								onClick={(event): void => select('workspace', event)}
							>
								<Building2 />
								<span className="tw:flex tw:flex-col">
									{LABELS.workspace}
									{isWorkspaceBlocked && (
										<span
											id={LOCKED_REASON_ID}
											className="tw:text-xs tw:text-muted-foreground"
										>
											{WORKSPACE_LOCKED_TOOLTIP}
										</span>
									)}
								</span>
							</DropdownMenuItem>
							{row('account', <User />, 'account-settings-nav-item')}
							{(isEnterpriseSelfHostedUser || isCommunityEnterpriseUser) &&
								row('license', <Shield />, 'manage-license-nav-item')}
							{row('keyboard-shortcuts', <Keyboard />, 'keyboard-shortcuts-nav-item')}
							{isKnownVersion(currentVersion) && (
								<DropdownMenuItem
									data-testid="version-nav-item"
									onClick={(): void => openInNewTab(releaseNotesUrl(currentVersion))}
								>
									<Tag />
									Version
									<span className="tw:ml-auto tw:inline-flex tw:items-center tw:gap-1.5 tw:font-mono tw:text-xs tw:text-muted-foreground">
										{currentVersion}
										{isUpdateAvailable && isKnownVersion(latestVersion) && (
											<span
												aria-label={`Update available: ${latestVersion}`}
												className="tw:size-1.5 tw:rounded-full tw:bg-primary"
											/>
										)}
									</span>
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							data-testid="logout-nav-item"
							onClick={(event): void => select('logout', event)}
						>
							<LogOut />
							{LABELS.logout}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export default UserMenu;
