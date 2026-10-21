import { Typography } from '@signozhq/ui/typography';
import { FUSESCOPE_NEW_ISSUE_URL } from 'components/AppSidebar/constants';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import history from 'lib/history';
import { openInNewTab } from 'utils/navigation';
import { ArrowRight } from '@signozhq/icons';

import awwSnapUrl from '@/assets/Icons/awwSnap.svg';

import './LogsError.styles.scss';

export default function LogsError(): JSX.Element {
	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const handleContactSupport = (): void => {
		if (isCloudUserVal) {
			history.push('/support');
		} else {
			openInNewTab(FUSESCOPE_NEW_ISSUE_URL);
		}
	};

	return (
		<div className="logs-error-container">
			<div className="logs-error-content">
				<img src={awwSnapUrl} alt="error-emoji" className="error-state-svg" />
				<Typography.Text>
					<span className="aww-snap">Aw snap :/ </span> Something went wrong. Please
					try again or contact support.
				</Typography.Text>

				<div className="contact-support" onClick={handleContactSupport}>
					<Typography.Link className="text">Contact Support </Typography.Link>

					<ArrowRight size={14} />
				</div>
			</div>
		</div>
	);
}
