import {
	ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueries } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { Toaster } from '@signozhq/ui/sonner';
import { TooltipProvider } from '@signozhq/ui/tooltip';
import getLocalStorageApi from 'api/browser/localstorage/get';
import setLocalStorageApi from 'api/browser/localstorage/set';
import logEvent from 'api/common/logEvent';
import { updateSubscription } from 'api/generated/services/subscriptions';
import type { UpdateSubscription200 } from 'api/generated/services/fuseScope.schemas';
import getUserVersion from 'api/v1/version/get';
import getUserLatestVersion from 'api/v1/version/getLatestVersion';
import cx from 'classnames';
import AppHeader from 'components/AppHeader/AppHeader';
import AppSidebar from 'components/AppSidebar/AppSidebar';
import AppSidebarProvider from 'components/AppSidebar/AppSidebarProvider';
import ChatSupportGateway from 'components/ChatSupportGateway/ChatSupportGateway';
import OverlayScrollbar from 'components/OverlayScrollbar/OverlayScrollbar';
import RefreshPaymentStatus from 'components/RefreshPaymentStatus/RefreshPaymentStatus';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { SubscriptionManagePermissions } from 'lib/authz/hooks/useAuthZ/permissions/subscription.permissions';
import { Events } from 'constants/events';
import { LOCALSTORAGE } from 'constants/localStorage';
import ROUTES from 'constants/routes';
import AIAssistantModal from 'container/AIAssistant/AIAssistantModal';
import AIAssistantPanel from 'container/AIAssistant/AIAssistantPanel';
import { useAIAssistantStore } from 'container/AIAssistant/store/useAIAssistantStore';
import BottomStrip from 'container/BottomStrip';
import dayjs from 'dayjs';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';
import { useNotifications } from 'hooks/useNotifications';
import { ChatSupportState, useChatSupport } from 'hooks/useChatSupport';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import history from 'lib/history';
import { isNull } from 'lodash-es';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';
import { useAppContext } from 'providers/App/App';
// eslint-disable-next-line no-restricted-imports
import { Dispatch } from 'redux';
import AppActions from 'types/actions';
import {
	UPDATE_CURRENT_ERROR,
	UPDATE_CURRENT_VERSION,
	UPDATE_LATEST_VERSION,
	UPDATE_LATEST_VERSION_ERROR,
} from 'types/actions/app';
import APIError from 'types/api/error';
import {
	LicenseEvent,
	LicensePlatform,
	LicenseState,
} from 'types/api/licensesV3/getActive';
import { getBaseUrl } from 'utils/basePath';
import { eventEmitter } from 'utils/getEventEmitter';
import {
	getFormattedDate,
	getFormattedDateWithMinutes,
	getRemainingDays,
} from 'utils/timeUtils';

import { ChildrenContainer, Layout, LayoutContent } from './styles';
import { getRouteKey, isFullScreenRoute } from './utils';

import './AppLayout.styles.scss';

// eslint-disable-next-line sonarjs/cognitive-complexity
function AppLayout(props: AppLayoutProps): JSX.Element {
	const { isLoggedIn, user, trialInfo, activeLicense, isFetchingActiveLicense } =
		useAppContext();

	const isAIAssistantEnabled = useIsAIAssistantEnabled();
	const fetchAIThreads = useAIAssistantStore((s) => s.fetchThreads);

	// Bootstrap the AI Assistant thread list once the base URL is configured.
	// Centralizing this here (rather than per-view) means the persisted active
	// thread's messages reload reliably on refresh — `fetchThreads` itself
	// hydrates the active conversation's messages after populating threadIds.
	useEffect(() => {
		if (isAIAssistantEnabled) {
			void fetchAIThreads();
		}
	}, [isAIAssistantEnabled, fetchAIThreads]);

	const { notifications } = useNotifications();

	const [showPaymentFailedWarning, setShowPaymentFailedWarning] =
		useState<boolean>(false);

	const errorBoundaryRef = useRef<Sentry.ErrorBoundary>(null);

	const [showSlowApiWarning, setShowSlowApiWarning] = useState(false);
	const [slowApiWarningShown, setSlowApiWarningShown] = useState(false);

	const isWorkspaceAccessRestricted = useMemo(() => {
		if (!activeLicense) {
			return false;
		}

		const isTerminated = activeLicense.state === LicenseState.TERMINATED;
		const isExpired = activeLicense.state === LicenseState.EXPIRED;
		const isCancelled = activeLicense.state === LicenseState.CANCELLED;
		const isDefaulted = activeLicense.state === LicenseState.DEFAULTED;
		const isEvaluationExpired =
			activeLicense.state === LicenseState.EVALUATION_EXPIRED;

		return (
			isTerminated ||
			isExpired ||
			isCancelled ||
			isDefaulted ||
			isEvaluationExpired
		);
	}, [activeLicense]);

	const handleBillingOnSuccess = (data: UpdateSubscription200): void => {
		if (data?.data?.redirectURL) {
			const newTab = document.createElement('a');
			newTab.href = data.data.redirectURL;
			newTab.target = '_blank';
			newTab.rel = 'noopener noreferrer';
			newTab.click();
		}
	};

	const handleBillingOnError = (error: APIError): void => {
		notifications.error({
			message: error.getErrorCode(),
			description: error.getErrorMessage(),
		});
	};

	const { mutate: manageCreditCard, isLoading: isLoadingManageBilling } =
		useMutation(updateSubscription, {
			onSuccess: (data) => {
				handleBillingOnSuccess(data);
			},
			onError: handleBillingOnError,
		});

	const isDarkMode = useIsDarkMode();

	const { pathname } = useLocation();
	const { t } = useTranslation(['titles']);

	const [getUserVersionResponse, getUserLatestVersionResponse] = useQueries([
		{
			queryFn: getUserVersion,
			queryKey: ['getUserVersion', user?.accessJwt],
			enabled: isLoggedIn,
		},
		{
			queryFn: getUserLatestVersion,
			queryKey: ['getUserLatestVersion', user?.accessJwt],
			enabled: isLoggedIn,
		},
	]);

	useEffect(() => {
		if (getUserLatestVersionResponse.status === 'idle' && isLoggedIn) {
			getUserLatestVersionResponse.refetch();
		}

		if (getUserVersionResponse.status === 'idle' && isLoggedIn) {
			getUserVersionResponse.refetch();
		}
	}, [getUserLatestVersionResponse, getUserVersionResponse, isLoggedIn]);

	const { children } = props;

	const dispatch = useDispatch<Dispatch<AppActions | any>>();

	const latestCurrentCounter = useRef(0);
	const latestVersionCounter = useRef(0);

	useEffect(() => {
		if (
			getUserLatestVersionResponse.isFetched &&
			getUserLatestVersionResponse.isError &&
			latestCurrentCounter.current === 0
		) {
			latestCurrentCounter.current = 1;

			dispatch({
				type: UPDATE_LATEST_VERSION_ERROR,
				payload: {
					isError: true,
				},
			});
			notifications.error({
				message: t('oops_something_went_wrong_version'),
			});
		}

		if (
			getUserVersionResponse.isFetched &&
			getUserVersionResponse.isError &&
			latestVersionCounter.current === 0
		) {
			latestVersionCounter.current = 1;

			dispatch({
				type: UPDATE_CURRENT_ERROR,
				payload: {
					isError: true,
				},
			});
			notifications.error({
				message: t('oops_something_went_wrong_version'),
			});
		}

		if (
			getUserVersionResponse.isFetched &&
			getUserVersionResponse.isSuccess &&
			getUserVersionResponse.data &&
			getUserVersionResponse.data.data
		) {
			dispatch({
				type: UPDATE_CURRENT_VERSION,
				payload: {
					currentVersion: getUserVersionResponse.data.data.version,
					ee: getUserVersionResponse.data.data.ee,
					setupCompleted: getUserVersionResponse.data.data.setupCompleted,
				},
			});
		}

		if (
			getUserLatestVersionResponse.isFetched &&
			getUserLatestVersionResponse.isSuccess &&
			getUserLatestVersionResponse.data &&
			getUserLatestVersionResponse.data.payload
		) {
			dispatch({
				type: UPDATE_LATEST_VERSION,
				payload: {
					latestVersion: getUserLatestVersionResponse.data.payload.tag_name,
				},
			});
		}
	}, [
		dispatch,
		isLoggedIn,
		pathname,
		t,
		getUserLatestVersionResponse.isLoading,
		getUserLatestVersionResponse.isError,
		getUserLatestVersionResponse.data,
		getUserVersionResponse.isLoading,
		getUserVersionResponse.isError,
		getUserVersionResponse.data,
		getUserVersionResponse.isSuccess,
		getUserLatestVersionResponse.isFetched,
		getUserVersionResponse.isFetched,
		getUserLatestVersionResponse.isSuccess,
		notifications,
	]);

	// reset error boundary on route change
	useEffect(() => {
		if (errorBoundaryRef.current) {
			errorBoundaryRef.current.resetErrorBoundary();
		}
	}, [pathname]);

	const isToDisplayLayout = isLoggedIn;
	const isSavedViewEnabled = useSavedViewEnabled();

	const routeKey = useMemo(() => getRouteKey(pathname), [pathname]);
	const pageTitle = t(routeKey);

	const renderFullScreen = isFullScreenRoute(pathname);

	const [showTrialExpiryBanner, setShowTrialExpiryBanner] = useState(false);

	const [showWorkspaceRestricted, setShowWorkspaceRestricted] = useState(false);

	useEffect(() => {
		if (
			!isFetchingActiveLicense &&
			activeLicense &&
			trialInfo?.onTrial &&
			!trialInfo?.trialConvertedToSubscription &&
			!trialInfo?.workSpaceBlock &&
			getRemainingDays(trialInfo?.trialEnd) < 7
		) {
			setShowTrialExpiryBanner(true);
		}
	}, [isFetchingActiveLicense, activeLicense, trialInfo]);

	useEffect(() => {
		if (!isFetchingActiveLicense && activeLicense) {
			const { platform } = activeLicense;

			if (
				isWorkspaceAccessRestricted &&
				platform === LicensePlatform.SELF_HOSTED
			) {
				setShowWorkspaceRestricted(true);
			}
		}
	}, [isFetchingActiveLicense, activeLicense, isWorkspaceAccessRestricted]);

	useEffect(() => {
		if (
			!isFetchingActiveLicense &&
			!isNull(activeLicense) &&
			activeLicense?.eventQueue?.event === LicenseEvent.DEFAULT
		) {
			setShowPaymentFailedWarning(true);
		}
	}, [activeLicense, isFetchingActiveLicense]);

	useEffect(() => {
		// after logging out hide the trial expiry banner
		if (!isLoggedIn) {
			setShowTrialExpiryBanner(false);
			setShowPaymentFailedWarning(false);
			setShowSlowApiWarning(false);
		}
	}, [isLoggedIn]);

	const handleUpgrade = useCallback((): void => {
		history.push(ROUTES.BILLING);
	}, []);

	const handleFailedPayment = useCallback((): void => {
		manageCreditCard({
			url: getBaseUrl(),
		});
	}, [manageCreditCard]);

	useEffect(() => {
		if (isDarkMode) {
			document.body.classList.remove('lightMode');
			document.body.classList.add('dark');
			document.body.classList.add('darkMode');
		} else {
			document.body.classList.add('lightMode');
			document.body.classList.remove('dark');
			document.body.classList.remove('darkMode');
		}
	}, [isDarkMode]);

	const chatSupport = useChatSupport();

	// Listen for API warnings
	const handleWarning = (
		isSlow: boolean,
		data: { duration: number; url: string; threshold: number },
	): void => {
		const dontShowSlowApiWarning = getLocalStorageApi(
			LOCALSTORAGE.DONT_SHOW_SLOW_API_WARNING,
		);

		logEvent(
			`Slow API Warning`,
			{
				durationMs: data.duration,
				url: data.url,
				thresholdMs: data.threshold,
			},
			'track',
			true, // rate limited - controlled by Backend
		);

		const isDontShowSlowApiWarning = dontShowSlowApiWarning === 'true';

		if (isDontShowSlowApiWarning) {
			setShowSlowApiWarning(false);
		} else {
			setShowSlowApiWarning(isSlow);
		}
	};

	useEffect(() => {
		eventEmitter.on(Events.SLOW_API_WARNING, handleWarning);

		return (): void => {
			eventEmitter.off(Events.SLOW_API_WARNING, handleWarning);
		};
	}, []);

	const handleDismissSlowApiWarning = (): void => {
		setShowSlowApiWarning(false);

		setLocalStorageApi(LOCALSTORAGE.DONT_SHOW_SLOW_API_WARNING, 'true');
	};

	useEffect(() => {
		if (
			showSlowApiWarning &&
			trialInfo?.onTrial &&
			!trialInfo?.trialConvertedToSubscription &&
			!slowApiWarningShown
		) {
			setSlowApiWarningShown(true);

			notifications.info({
				message: (
					<div>
						Our systems are taking longer than expected for your trial workspace.
						Please{' '}
						<span>
							<a
								className="upgrade-link"
								onClick={(): void => {
									notifications.destroy('slow-api-warning');

									logEvent(`Slow API Banner: Upgrade clicked`, {});

									handleUpgrade();
								}}
							>
								upgrade
							</a>
							your workspace for a smoother experience.
						</span>
					</div>
				),
				duration: 60000,
				placement: 'topRight',
				onClose: handleDismissSlowApiWarning,
				key: 'slow-api-warning',
			});
		}
	}, [
		showSlowApiWarning,
		notifications,
		user.role,
		isLoadingManageBilling,
		handleFailedPayment,
		slowApiWarningShown,
		handleUpgrade,
		trialInfo?.onTrial,
		trialInfo?.trialConvertedToSubscription,
	]);

	const renderWorkspaceRestrictedBanner = (): JSX.Element => (
		<div className="workspace-restricted-banner">
			{activeLicense?.state === LicenseState.TERMINATED && (
				<>
					Your FuseScope license is terminated, enterprise features have been
					disabled. Please contact support at{' '}
					<a href="mailto:support@signoz.io">support@signoz.io</a> for new license
				</>
			)}
			{activeLicense?.state === LicenseState.EXPIRED && (
				<>
					Your FuseScope license has expired. Please contact support at{' '}
					<a href="mailto:support@signoz.io">support@signoz.io</a> for renewal to
					avoid termination of license as per our{' '}
					<a
						href="https://signoz.io/terms-of-service"
						target="_blank"
						rel="noopener noreferrer"
					>
						terms of service
					</a>
				</>
			)}
			{activeLicense?.state === LicenseState.CANCELLED && (
				<>
					Your FuseScope license is cancelled. Please contact support at{' '}
					<a href="mailto:support@signoz.io">support@signoz.io</a> for reactivation
					to avoid termination of license as per our{' '}
					<a
						href="https://signoz.io/terms-of-service"
						target="_blank"
						rel="noopener noreferrer"
					>
						terms of service
					</a>
				</>
			)}

			{activeLicense?.state === LicenseState.DEFAULTED && (
				<>
					Your FuseScope license is defaulted. Please clear the bill to continue
					using the enterprise features. Contact support at{' '}
					<a href="mailto:support@signoz.io">support@signoz.io</a> to avoid
					termination of license as per our{' '}
					<a
						href="https://signoz.io/terms-of-service"
						target="_blank"
						rel="noopener noreferrer"
					>
						terms of service
					</a>
				</>
			)}

			{activeLicense?.state === LicenseState.EVALUATION_EXPIRED && (
				<>
					Your FuseScope trial has ended. Please contact support at{' '}
					<a href="mailto:support@signoz.io">support@signoz.io</a> for next steps to
					avoid termination of license as per our{' '}
					<a
						href="https://signoz.io/terms-of-service"
						target="_blank"
						rel="noopener noreferrer"
					>
						terms of service
					</a>
				</>
			)}
		</div>
	);

	const SHOW_TRIAL_EXPIRY_BANNER =
		showTrialExpiryBanner && !showPaymentFailedWarning;
	const SHOW_WORKSPACE_RESTRICTED_BANNER = showWorkspaceRestricted;
	const SHOW_PAYMENT_FAILED_BANNER =
		!showTrialExpiryBanner && showPaymentFailedWarning;

	return (
		<TooltipProvider>
			<Layout className={cx(isDarkMode ? 'darkMode dark' : 'lightMode')}>
				<Helmet>
					<title>{pageTitle}</title>
				</Helmet>

				{isLoggedIn && (
					<div className={cx('app-banner-wrapper')}>
						{SHOW_TRIAL_EXPIRY_BANNER && (
							<div className="trial-expiry-banner">
								You are in free trial period. Your free trial will end on{' '}
								<span>{getFormattedDate(trialInfo?.trialEnd || Date.now())}.</span>
								<span>
									{' '}
									Please{' '}
									<a className="upgrade-link" onClick={handleUpgrade}>
										upgrade
									</a>
									to continue using FuseScope features.
									<span className="refresh-payment-status">
										{' '}
										| Already upgraded? <RefreshPaymentStatus type="text" />
									</span>
								</span>
							</div>
						)}

						{SHOW_WORKSPACE_RESTRICTED_BANNER && renderWorkspaceRestrictedBanner()}

						{SHOW_PAYMENT_FAILED_BANNER && (
							<div className="payment-failed-banner">
								Your bill payment has failed. Your workspace will get suspended on{' '}
								<span>
									{getFormattedDateWithMinutes(
										activeLicense?.eventQueue?.scheduledAt
											? dayjs(activeLicense.eventQueue.scheduledAt).unix()
											: dayjs().unix(),
									)}
									.
								</span>
								<span>
									{' '}
									Please{' '}
									<AuthZTooltip checks={SubscriptionManagePermissions}>
										<a className="upgrade-link" onClick={handleFailedPayment}>
											pay the bill
										</a>
									</AuthZTooltip>
									to continue using FuseScope features.
									<span className="refresh-payment-status">
										{' '}
										| Already paid? <RefreshPaymentStatus type="text" />
									</span>
								</span>
							</div>
						)}
					</div>
				)}

				<AppSidebarProvider
					hasSidebar={isToDisplayLayout && !renderFullScreen}
					className={cx(
						'app-layout',
						isDarkMode ? 'darkMode dark' : 'lightMode',
						SHOW_WORKSPACE_RESTRICTED_BANNER ? 'isWorkspaceRestricted' : '',
						SHOW_TRIAL_EXPIRY_BANNER ? 'isTrialExpired' : '',
						SHOW_PAYMENT_FAILED_BANNER ? 'isPaymentFailed' : '',
					)}
				>
					{isToDisplayLayout && !renderFullScreen && <AppSidebar />}
					<div
						className={cx('app-content', {
							'full-screen-content': renderFullScreen,
						})}
						data-overlayscrollbars-initialize
					>
						{isToDisplayLayout && !renderFullScreen && <AppHeader />}
						<Sentry.ErrorBoundary
							fallback={<ErrorBoundaryFallback />}
							ref={errorBoundaryRef}
						>
							<LayoutContent data-overlayscrollbars-initialize>
								<OverlayScrollbar>
									<ChildrenContainer>{children}</ChildrenContainer>
								</OverlayScrollbar>
							</LayoutContent>
						</Sentry.ErrorBoundary>

						{isSavedViewEnabled && isToDisplayLayout && !renderFullScreen && (
							<BottomStrip />
						)}
					</div>

					{isLoggedIn && isAIAssistantEnabled && (
						<>
							<AIAssistantPanel />
							<AIAssistantModal />
						</>
					)}
				</AppSidebarProvider>

				{chatSupport === ChatSupportState.NeedsCard && !isSavedViewEnabled && (
					<ChatSupportGateway />
				)}

				<Toaster
					offset={{ bottom: 'calc(var(--bottom-strip-height, 0px) + 24px)' }}
				/>
			</Layout>
		</TooltipProvider>
	);
}

interface AppLayoutProps {
	children: ReactNode;
}

export default AppLayout;
