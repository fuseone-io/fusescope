import { useHistory } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { routePermission } from 'utils/permission';

const SENDING_DATA_DOCS_URL = fuseScopeDocsUrl(
	'/sending-data/instrumentation/',
);

/** Cloud workspaces open the data source onboarding; self-hosted ones the docs. */
function DataSourcesButton(): JSX.Element {
	const history = useHistory();
	const { user } = useAppContext();
	const { isCloudUser } = useGetTenantLicense();

	if (
		isCloudUser &&
		routePermission.GET_STARTED_WITH_CLOUD.includes(user.role)
	) {
		return (
			<Button
				data-testid="integrations-data-sources"
				onClick={(): void => history.push(ROUTES.GET_STARTED_WITH_CLOUD)}
			>
				View 150+ data sources
				<ArrowRight aria-hidden="true" />
			</Button>
		);
	}

	return (
		<Button
			asChild
			className="tw:bg-primary! tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
		>
			<a
				href={SENDING_DATA_DOCS_URL}
				target="_blank"
				rel="noopener noreferrer"
				data-testid="integrations-data-sources"
			>
				Sending data docs
				<ArrowUpRight aria-hidden="true" />
			</a>
		</Button>
	);
}

export default DataSourcesButton;
