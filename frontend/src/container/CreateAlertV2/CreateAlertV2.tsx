import { initialQueriesMap } from 'constants/queryBuilder';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';
import { mapQueryDataFromApi } from 'lib/newQueryBuilder/queryBuilderMappers/mapQueryDataFromApi';

import AlertSteps from './AlertSteps';
import { CreateAlertProvider } from './context';
import { buildInitialAlertDef } from './context/utils';
import CreateAlertHeader from './CreateAlertHeader';
import Footer from './Footer';
import { CreateAlertV2Props } from './types';
import { Spinner } from './utils';

import './CreateAlertV2.styles.scss';

function CreateAlertV2({ alertType }: CreateAlertV2Props): JSX.Element {
	const queryToRedirect = buildInitialAlertDef(alertType);
	const currentQueryToRedirect = mapQueryDataFromApi(
		queryToRedirect.condition.compositeQuery,
	);

	useShareBuilderUrl({ defaultValue: currentQueryToRedirect });

	return (
		<CreateAlertProvider initialAlertType={alertType}>
			<Spinner />
			<div className="create-alert-v2-container">
				<CreateAlertHeader />
				<AlertSteps />
			</div>
			<Footer />
		</CreateAlertProvider>
	);
}

CreateAlertV2.defaultProps = {
	initialQuery: initialQueriesMap.metrics,
};

export default CreateAlertV2;
