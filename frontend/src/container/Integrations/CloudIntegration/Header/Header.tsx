import PageHeader from 'components/PageTemplate/components/PageHeader';
import { IntegrationType } from 'container/Integrations/types';

import { useThemedIntegrationIcon } from '../../components/useThemedIntegrationIcon';
import AccountActions from '../AmazonWebServices/AccountActions/AccountActions';
import { getIntegrationMetadata } from '../utils';

function Header({ type }: { type: IntegrationType }): JSX.Element {
	const themedIcon = useThemedIntegrationIcon();
	const { title, description, logo } = getIntegrationMetadata(type);

	return (
		<PageHeader
			testId="cloud-integration-header"
			icon={
				<img
					src={themedIcon(type, logo)}
					alt={type}
					className="tw:size-7 tw:object-contain"
				/>
			}
			title={title}
			description={description}
			actions={<AccountActions type={type} />}
		/>
	);
}

export default Header;
