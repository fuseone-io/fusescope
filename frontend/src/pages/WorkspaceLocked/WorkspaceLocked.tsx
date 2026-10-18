import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { Typography } from '@signozhq/ui/typography';
import logEvent from 'api/common/logEvent';
import { createSubscription } from 'api/generated/services/subscriptions';
import RefreshPaymentStatus from 'components/RefreshPaymentStatus/RefreshPaymentStatus';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { useNotifications } from 'hooks/useNotifications';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import history from 'lib/history';
import { Lock } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import APIError from 'types/api/error';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { isModifierKeyPressed } from 'utils/app';
import { getBaseUrl } from 'utils/basePath';
import { getFormattedDate } from 'utils/timeUtils';

import UpgradeButton from './UpgradeButton';
import WorkspaceLockedTabs from './WorkspaceLockedTabs';

const SECONDARY_BUTTON_CLASS =
	'tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!';

export default function WorkspaceBlocked(): JSX.Element {
	const { isFetchingActiveLicense, trialInfo, activeLicense } = useAppContext();
	const { notifications } = useNotifications();
	const { safeNavigate } = useSafeNavigate();

	const { t } = useTranslation(['workspaceLocked']);

	useEffect((): void => {
		void logEvent('Workspace Blocked: Screen Viewed', {});
	}, []);

	const handleContactUsClick = (): void => {
		void logEvent('Workspace Blocked: Contact Us Clicked', {});
	};

	const handleTabClick = (key: string): void => {
		void logEvent('Workspace Blocked: Screen Tabs Clicked', { tabKey: key });
	};

	const handleCollapseChange = (key: string | string[]): void => {
		const lastKey = Array.isArray(key) ? key.slice(-1)[0] : key;
		void logEvent('Workspace Blocked: Screen Tab FAQ Item Clicked', {
			panelKey: lastKey,
		});
	};

	useEffect(() => {
		if (!isFetchingActiveLicense) {
			const shouldBlockWorkspace = trialInfo?.workSpaceBlock;

			if (
				!shouldBlockWorkspace ||
				activeLicense?.platform === LicensePlatform.SELF_HOSTED
			) {
				history.push(ROUTES.HOME);
			}
		}
	}, [
		isFetchingActiveLicense,
		trialInfo?.workSpaceBlock,
		activeLicense?.platform,
	]);

	const { mutate: updateCreditCard, isLoading } = useMutation(
		createSubscription,
		{
			onSuccess: (data) => {
				if (data.data?.redirectURL) {
					const newTab = document.createElement('a');
					newTab.href = data.data.redirectURL;
					newTab.target = '_blank';
					newTab.rel = 'noopener noreferrer';
					newTab.click();
				}
			},
			onError: (error: APIError) =>
				notifications.error({
					message: error.getErrorCode(),
					description: error.getErrorMessage(),
				}),
		},
	);

	const handleUpdateCreditCard = useCallback(async () => {
		void logEvent('Workspace Blocked: User Clicked Update Credit Card', {});

		updateCreditCard({
			url: getBaseUrl(),
		});
	}, [updateCreditCard]);

	const handleExtendTrial = (): void => {
		void logEvent('Workspace Blocked: User Clicked Extend Trial', {});

		notifications.info({
			message: t('extendTrial'),
			duration: 0,
			description: (
				<Typography>
					{t('extendTrialMsgPart1')}{' '}
					<a href="mailto:cloud-support@signoz.io">cloud-support@signoz.io</a>{' '}
					{t('extendTrialMsgPart2')}
				</Typography>
			),
		});
	};

	const handleViewBilling = (e?: React.MouseEvent): void => {
		void logEvent('Workspace Blocked: User Clicked View Billing', {});

		safeNavigate(ROUTES.BILLING, { newTab: !!e && isModifierKeyPressed(e) });
	};

	const isPageLoading = isFetchingActiveLicense || !trialInfo;

	return (
		<SystemPagePanel
			icon={<Lock />}
			tone="warning"
			loading={isPageLoading}
			eyebrow={t('trialPlanExpired')}
			title="Upgrade to Continue"
			description={
				<p>
					{t('upgradeNow')}
					<br />
					{t('yourDataIsSafe')}{' '}
					<span className="tw:font-semibold tw:text-foreground">
						{getFormattedDate(trialInfo?.gracePeriodEnd || Date.now())}
					</span>{' '}
					{t('actNow')}
				</p>
			}
			actions={
				<>
					<UpgradeButton isLoading={isLoading} onClick={handleUpdateCreditCard}>
						Continue my Journey
					</UpgradeButton>
					<Button
						variant="outline"
						className={SECONDARY_BUTTON_CLASS}
						onClick={handleExtendTrial}
					>
						{t('needMoreTime')}
					</Button>
				</>
			}
			footer={
				<>
					<Button
						variant="link"
						size="sm"
						className="tw:text-muted-foreground"
						onClick={(e): void => handleViewBilling(e)}
					>
						View Billing
					</Button>
					<RefreshPaymentStatus withPortal={false} />
					<Button
						asChild
						variant="outline"
						size="sm"
						className={SECONDARY_BUTTON_CLASS}
					>
						<a href="mailto:cloud-support@signoz.io" onClick={handleContactUsClick}>
							Contact Us
						</a>
					</Button>
				</>
			}
			extra={
				!isPageLoading && (
					<WorkspaceLockedTabs
						isLoading={isLoading}
						onUpgrade={handleUpdateCreditCard}
						onTabClick={handleTabClick}
						onCollapseChange={handleCollapseChange}
					/>
				)
			}
		/>
	);
}
