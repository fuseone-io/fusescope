import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { updateSubscription } from 'api/generated/services/subscriptions';
import RefreshPaymentStatus from 'components/RefreshPaymentStatus/RefreshPaymentStatus';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { useNotifications } from 'hooks/useNotifications';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { SubscriptionManagePermissions } from 'lib/authz/hooks/useAuthZ/permissions/subscription.permissions';
import history from 'lib/history';
import { CreditCard, LoaderCircle } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import APIError from 'types/api/error';
import { LicensePlatform, LicenseState } from 'types/api/licensesV3/getActive';
import { getBaseUrl } from 'utils/basePath';

import featureGraphicCorrelationUrl from '@/assets/Images/feature-graphic-correlation.svg';

function WorkspaceSuspended(): JSX.Element {
	const { notifications } = useNotifications();
	const { activeLicense, isFetchingActiveLicense } = useAppContext();

	const { t } = useTranslation(['failedPayment']);

	const { mutate: manageCreditCard, isLoading } = useMutation(
		updateSubscription,
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
		manageCreditCard({
			url: getBaseUrl(),
		});
	}, [manageCreditCard]);

	useEffect(() => {
		if (!isFetchingActiveLicense) {
			const shouldSuspendWorkspace =
				activeLicense?.state === LicenseState.DEFAULTED;

			if (
				!shouldSuspendWorkspace ||
				activeLicense?.platform === LicensePlatform.SELF_HOSTED
			) {
				history.push(ROUTES.HOME);
			}
		}
	}, [isFetchingActiveLicense, activeLicense]);

	const isPageLoading = isFetchingActiveLicense || !activeLicense;

	return (
		<SystemPagePanel
			icon={<CreditCard />}
			tone="warning"
			loading={isPageLoading}
			eyebrow={t('workspaceSuspended')}
			title={t('actionHeader')}
			description={t('actionDescription')}
			actions={
				<>
					<AuthZTooltip checks={SubscriptionManagePermissions} withPortal={false}>
						<Button disabled={isLoading} onClick={handleUpdateCreditCard}>
							{isLoading && <LoaderCircle className="tw:animate-spin" />}
							<span className="translate-safe">{t('continueMyJourney')}</span>
						</Button>
					</AuthZTooltip>
					<RefreshPaymentStatus withPortal={false} />
				</>
			}
			footer={
				<>
					<span>Got Questions?</span>
					<Button
						asChild
						variant="outline"
						size="sm"
						className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
					>
						<a href="mailto:cloud-support@signoz.io">Contact Us</a>
					</Button>
				</>
			}
			extra={
				!isPageLoading && (
					<img
						src={featureGraphicCorrelationUrl}
						alt="correlation-graphic"
						className="tw:block tw:w-full tw:rounded-xl tw:border tw:border-border"
					/>
				)
			}
		/>
	);
}

export default WorkspaceSuspended;
