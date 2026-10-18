import {
	MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import RouteTab from 'components/RouteTab';
import { FeatureKeys } from 'constants/features';
import ROUTES from 'constants/routes';
import { routeConfig } from 'container/SideNav/config';
import { buildNavUrl, getQueryString } from 'container/SideNav/helper';
import { settingsNavSections } from 'container/SideNav/menuItems';
import { SidebarItem } from 'container/SideNav/sideNav.types';
import useComponentPermission from 'hooks/useComponentPermission';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import history from 'lib/history';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import SettingsNav from './components/SettingsNav';
import { getRoutes } from './utils';

import './Settings.styles.scss';

function SettingsPage(): JSX.Element {
	const { pathname, search } = useLocation();

	const { user, featureFlags, trialInfo, isFetchingActiveLicense } =
		useAppContext();
	const { isCloudUser, isEnterpriseSelfHostedUser } = useGetTenantLicense();

	const [settingsMenuItems, setSettingsMenuItems] = useState<SidebarItem[]>(
		settingsNavSections.flatMap((section) => section.items),
	);

	const isAdmin = user.role === USER_ROLES.ADMIN;
	const isEditor = user.role === USER_ROLES.EDITOR;
	const isViewer = user.role === USER_ROLES.VIEWER;

	const isWorkspaceBlocked = trialInfo?.workSpaceBlock || false;

	const [isCurrentOrgSettings] = useComponentPermission(
		['current_org_settings'],
		user.role,
	);
	const { t } = useTranslation(['routes']);

	const isGatewayEnabled =
		featureFlags?.find((feature) => feature.name === FeatureKeys.GATEWAY)
			?.active || false;

	// eslint-disable-next-line sonarjs/cognitive-complexity
	useEffect(() => {
		setSettingsMenuItems((prevItems) => {
			let updatedItems = [...prevItems];

			if (trialInfo?.workSpaceBlock && !isFetchingActiveLicense) {
				updatedItems = updatedItems.map((item) => ({
					...item,
					isEnabled:
						item.key === ROUTES.BILLING ||
						!!(
							isAdmin &&
							(item.key === ROUTES.ORG_SETTINGS ||
								item.key === ROUTES.MEMBERS_SETTINGS ||
								item.key === ROUTES.MY_SETTINGS ||
								item.key === ROUTES.SHORTCUTS)
						),
				}));

				return updatedItems;
			}

			if (isCloudUser) {
				// Visible to all authenticated users
				updatedItems = updatedItems.map((item) => ({
					...item,
					isEnabled:
						item.key === ROUTES.BILLING ||
						item.key === ROUTES.ROLES_SETTINGS ||
						item.key === ROUTES.ROLE_CREATE ||
						item.key === ROUTES.ROLE_DETAILS ||
						item.key === ROUTES.ROLE_EDIT ||
						item.key === ROUTES.SERVICE_ACCOUNTS_SETTINGS
							? true
							: item.isEnabled,
				}));

				if (isAdmin) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled:
							item.key === ROUTES.INTEGRATIONS ||
							item.key === ROUTES.INGESTION_SETTINGS ||
							item.key === ROUTES.ORG_SETTINGS ||
							item.key === ROUTES.MEMBERS_SETTINGS ||
							item.key === ROUTES.SHORTCUTS ||
							item.key === ROUTES.MCP_SERVER
								? true
								: item.isEnabled,
					}));
				}

				if (isEditor) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled:
							item.key === ROUTES.INGESTION_SETTINGS ||
							item.key === ROUTES.INTEGRATIONS ||
							item.key === ROUTES.SHORTCUTS ||
							item.key === ROUTES.MCP_SERVER
								? true
								: item.isEnabled,
					}));
				}

				if (isViewer) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled: item.key === ROUTES.MCP_SERVER ? true : item.isEnabled,
					}));
				}
			}

			if (isEnterpriseSelfHostedUser) {
				// Visible to all authenticated users
				updatedItems = updatedItems.map((item) => ({
					...item,
					isEnabled:
						item.key === ROUTES.BILLING ||
						item.key === ROUTES.ROLES_SETTINGS ||
						item.key === ROUTES.ROLE_CREATE ||
						item.key === ROUTES.ROLE_DETAILS ||
						item.key === ROUTES.ROLE_EDIT ||
						item.key === ROUTES.SERVICE_ACCOUNTS_SETTINGS
							? true
							: item.isEnabled,
				}));

				if (isAdmin) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled:
							item.key === ROUTES.INTEGRATIONS ||
							item.key === ROUTES.ORG_SETTINGS ||
							item.key === ROUTES.MEMBERS_SETTINGS ||
							item.key === ROUTES.INGESTION_SETTINGS ||
							item.key === ROUTES.MCP_SERVER
								? true
								: item.isEnabled,
					}));
				}

				if (isEditor) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled:
							item.key === ROUTES.INTEGRATIONS ||
							item.key === ROUTES.INGESTION_SETTINGS ||
							item.key === ROUTES.MCP_SERVER
								? true
								: item.isEnabled,
					}));
				}

				if (isViewer) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled: item.key === ROUTES.MCP_SERVER ? true : item.isEnabled,
					}));
				}
			}

			if (!isCloudUser && !isEnterpriseSelfHostedUser) {
				// Visible to all authenticated users
				updatedItems = updatedItems.map((item) => ({
					...item,
					isEnabled:
						item.key === ROUTES.ROLES_SETTINGS ||
						item.key === ROUTES.ROLE_CREATE ||
						item.key === ROUTES.ROLE_DETAILS ||
						item.key === ROUTES.ROLE_EDIT ||
						item.key === ROUTES.SERVICE_ACCOUNTS_SETTINGS
							? true
							: item.isEnabled,
				}));

				if (isAdmin) {
					updatedItems = updatedItems.map((item) => ({
						...item,
						isEnabled:
							item.key === ROUTES.ORG_SETTINGS || item.key === ROUTES.MEMBERS_SETTINGS
								? true
								: item.isEnabled,
					}));
				}

				// disable billing and integrations for non-cloud users
				updatedItems = updatedItems.map((item) => ({
					...item,
					isEnabled:
						item.key === ROUTES.BILLING || item.key === ROUTES.INTEGRATIONS
							? false
							: item.isEnabled,
				}));
			}

			return updatedItems;
		});
	}, [
		isAdmin,
		isEditor,
		isViewer,
		isCloudUser,
		isEnterpriseSelfHostedUser,
		isFetchingActiveLicense,
		trialInfo?.workSpaceBlock,
		pathname,
	]);

	const routes = useMemo(
		() =>
			getRoutes(
				user.role,
				isCurrentOrgSettings,
				isGatewayEnabled,
				isWorkspaceBlocked,
				isCloudUser,
				isEnterpriseSelfHostedUser,
				t,
			),
		[
			user.role,
			isCurrentOrgSettings,
			isGatewayEnabled,
			isWorkspaceBlocked,
			isCloudUser,
			isEnterpriseSelfHostedUser,
			t,
		],
	);

	const hrefFor = useCallback(
		(key: string): string =>
			buildNavUrl(
				key,
				getQueryString(routeConfig[key] || [], new URLSearchParams(search)),
			),
		[search],
	);

	const onClickHandler = useCallback(
		(key: string, event: MouseEvent | null) => {
			const url = hrefFor(key);

			if (pathname !== key) {
				if (event && isModifierKeyPressed(event)) {
					openInNewTab(url);
				} else {
					history.push(url, {
						from: pathname,
					});
				}
			}
		},
		[hrefFor, pathname],
	);

	const handleMenuItemClick = (
		event: ReactMouseEvent,
		item: SidebarItem,
	): void => {
		void logEvent('Settings V2: Menu clicked', {
			menuLabel: item.label,
			menuRoute: item.key,
		});
		onClickHandler(item?.key as string, event as unknown as MouseEvent);
	};

	const isActiveNavItem = (key: string): boolean => {
		if (
			pathname.startsWith(ROUTES.ROLES_SETTINGS) &&
			key === ROUTES.ROLES_SETTINGS
		) {
			return true;
		}

		return pathname === key;
	};

	const visibleSections = useMemo(
		() =>
			settingsNavSections
				.map((section) => ({
					...section,
					items: section.items.filter((sectionItem) =>
						settingsMenuItems.some(
							(item) => item.key === sectionItem.key && item.isEnabled,
						),
					),
				}))
				.filter((section) => section.items.length > 0),
		[settingsMenuItems],
	);

	return (
		<div className="settings-page tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-background tw:md:flex-row">
			<SettingsNav
				sections={visibleSections}
				hrefFor={hrefFor}
				isActive={isActiveNavItem}
				onSelect={handleMenuItemClick}
			/>

			<div className="settings-page-content tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-y-auto">
				<RouteTab
					routes={routes}
					activeKey={pathname}
					history={history}
					tabBarStyle={{ display: 'none' }}
				/>
			</div>
		</div>
	);
}

export default SettingsPage;
