import { useTranslation } from 'react-i18next';
import { MAX_RPS_LIMIT } from 'constants/global';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { TriangleAlert } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { ServicesList } from 'types/api/metrics/getService';
import { getTotalRPS } from 'utils/services';

interface TrialRpsWarningProps {
	services: ServicesList[];
}

/** Cloud trials past the ingestion limit get a warning above the table. */
function TrialRpsWarning({
	services,
}: TrialRpsWarningProps): JSX.Element | null {
	const { t: getText } = useTranslation(['services']);
	const { isFetchingActiveLicense, trialInfo } = useAppContext();
	const { isCloudUser } = useGetTenantLicense();

	const onActiveTrial =
		!isFetchingActiveLicense &&
		trialInfo?.onTrial &&
		!trialInfo?.trialConvertedToSubscription &&
		isCloudUser;

	if (!onActiveTrial || getTotalRPS(services) <= MAX_RPS_LIMIT) {
		return null;
	}

	return (
		<div className="fs-ui tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:bg-warning-soft tw:px-4 tw:py-3 tw:font-sans tw:text-[13px] tw:text-warning-ink">
			<TriangleAlert aria-hidden="true" className="tw:size-5 tw:flex-none" />
			<p>
				{getText('rps_over_100')}
				<a href="mailto:cloud-support@signoz.io" className="tw:underline">
					email
				</a>
			</p>
		</div>
	);
}

export default TrialRpsWarning;
