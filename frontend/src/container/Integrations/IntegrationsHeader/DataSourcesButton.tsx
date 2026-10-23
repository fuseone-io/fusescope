import { useHistory } from 'react-router-dom';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { ArrowRight } from 'lucide-react';

/** Opens the Get started catalog of data sources. */
function DataSourcesButton(): JSX.Element {
	const history = useHistory();

	return (
		<Button
			data-testid="integrations-data-sources"
			onClick={(): void => history.push(ROUTES.GET_STARTED)}
		>
			Browse data sources
			<ArrowRight aria-hidden="true" />
		</Button>
	);
}

export default DataSourcesButton;
