import { useEffect } from 'react';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { Ban } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform, LicenseState } from 'types/api/licensesV3/getActive';

import featureGraphicCorrelationUrl from '@/assets/Images/feature-graphic-correlation.svg';

const LINK_CLASS = 'tw:text-primary! tw:underline tw:underline-offset-2';

function WorkspaceAccessRestricted(): JSX.Element {
	const { activeLicense, isFetchingActiveLicense } = useAppContext();

	useEffect(() => {
		if (!isFetchingActiveLicense) {
			const isTerminated = activeLicense?.state === LicenseState.TERMINATED;
			const isExpired = activeLicense?.state === LicenseState.EXPIRED;
			const isCancelled = activeLicense?.state === LicenseState.CANCELLED;

			const isWorkspaceAccessRestricted = isTerminated || isExpired || isCancelled;

			if (
				!isWorkspaceAccessRestricted ||
				activeLicense.platform === LicensePlatform.SELF_HOSTED
			) {
				history.push(ROUTES.HOME);
			}
		}
	}, [isFetchingActiveLicense, activeLicense]);

	const supportLink = (
		<a href="mailto:cloud-support@signoz.io" className={LINK_CLASS}>
			cloud-support@signoz.io
		</a>
	);

	const termsLink = (
		<a
			href="https://signoz.io/terms-of-service"
			target="_blank"
			rel="noopener noreferrer"
			className={LINK_CLASS}
		>
			terms of service
		</a>
	);

	const isPageLoading = isFetchingActiveLicense || !activeLicense;

	return (
		<SystemPagePanel
			icon={<Ban />}
			tone="error"
			loading={isPageLoading}
			title="Your workspace access is restricted"
			description={
				<p className="tw:text-base">
					{activeLicense?.state === LicenseState.TERMINATED && (
						<>
							Your FuseScope license is terminated, please contact support at{' '}
							{supportLink} for a new deployment
						</>
					)}
					{activeLicense?.state === LicenseState.EXPIRED && (
						<>
							Your FuseScope license is expired, please contact support at{' '}
							{supportLink} for renewal to avoid termination of license as per our{' '}
							{termsLink}.
						</>
					)}
					{activeLicense?.state === LicenseState.CANCELLED && (
						<>
							Your FuseScope license is cancelled, please contact support at{' '}
							{supportLink} for reactivation to avoid termination of license as per our{' '}
							{termsLink}.
						</>
					)}
				</p>
			}
			actions={
				<Button
					asChild
					variant="outline"
					className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				>
					<a href="mailto:cloud-support@signoz.io">Contact Us</a>
				</Button>
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

export default WorkspaceAccessRestricted;
