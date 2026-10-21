import { FUSESCOPE_NEW_ISSUE_URL } from 'components/AppSidebar/constants';
import { Button } from 'components/ui/button';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import history from 'lib/history';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { openInNewTab } from 'utils/navigation';

import InfraEmptyState from '../../components/InfraEmptyState';

export default function EntityError(): JSX.Element {
	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const handleContactSupport = (): void => {
		if (isCloudUserVal) {
			history.push('/support');
		} else {
			openInNewTab(FUSESCOPE_NEW_ISSUE_URL);
		}
	};

	return (
		<InfraEmptyState
			icon={<TriangleAlert />}
			title="Aw snap :/"
			description="Something went wrong. Please try again or contact support."
			actions={
				<Button variant="outline" size="sm" onClick={handleContactSupport}>
					Contact Support
					<ArrowRight />
				</Button>
			}
		/>
	);
}
