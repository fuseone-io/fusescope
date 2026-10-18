import { useCallback } from 'react';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { handleContactSupport } from 'container/Integrations/utils';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { ShieldAlert } from 'lucide-react';
import { useQueryState } from 'nuqs';

import { useAppContext } from '../../providers/App/App';
import { USER_ROLES } from '../../types/roles';

function UnAuthorizePage(): JSX.Element {
	const [debugCurrentRole] = useQueryState('currentRole');
	const { user } = useAppContext();
	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	const userIsAnonymous =
		debugCurrentRole === USER_ROLES.ANONYMOUS ||
		user.role === USER_ROLES.ANONYMOUS;
	const mistakeMessage = userIsAnonymous
		? 'If you believe this is a mistake, please contact your administrator or'
		: 'Please contact your administrator.';

	const handleContactSupportClick = useCallback((): void => {
		handleContactSupport(isCloudUserVal);
	}, [isCloudUserVal]);

	return (
		<SystemPagePanel
			className="unauthorized-page"
			icon={<ShieldAlert />}
			tone="warning"
			title="Access Restricted"
			description={
				<p className="unauthorized-page__description">
					It looks like you don&lsquo;t have permission to view this page. <br />
					{mistakeMessage}
					{userIsAnonymous ? (
						<>
							{' '}
							<button
								type="button"
								className="contact-support-link tw:cursor-pointer tw:text-primary tw:hover:underline"
								onClick={handleContactSupportClick}
							>
								reach out to us.
							</button>
						</>
					) : null}
				</p>
			}
		/>
	);
}

export default UnAuthorizePage;
