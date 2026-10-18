import PageHeader from 'components/PageTemplate/components/PageHeader';
import { Button } from 'components/ui/button';
import { IntegrationType } from 'container/Integrations/types';
import { LifeBuoy } from 'lucide-react';

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
			actions={
				<>
					<AccountActions type={type} />
					{type === IntegrationType.AWS_SERVICES && (
						<Button
							variant="outline"
							className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
							onClick={(): void => {
								window.open(
									'https://signoz.io/blog/native-aws-integrations-with-autodiscovery/',
									'_blank',
								);
							}}
						>
							<LifeBuoy aria-hidden="true" />
							Get Help
						</Button>
					)}
				</>
			}
		/>
	);
}

export default Header;
