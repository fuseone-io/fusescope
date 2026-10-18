import { useMemo } from 'react';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';
import { mapQueryDataFromApi } from 'lib/newQueryBuilder/queryBuilderMappers/mapQueryDataFromApi';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { PostableAlertRuleV2 } from 'types/api/alerts/alertTypesV2';

import AlertSteps from '../CreateAlertV2/AlertSteps';
import { buildInitialAlertDef } from '../CreateAlertV2/context/utils';
import Footer from '../CreateAlertV2/Footer';
import { Spinner } from '../CreateAlertV2/utils';

import '../CreateAlertV2/CreateAlertV2.styles.scss';

interface EditAlertV2Props {
	alertType?: AlertTypes;
	initialAlert: PostableAlertRuleV2;
}

function EditAlertV2({
	alertType = AlertTypes.METRICS_BASED_ALERT,
	initialAlert,
}: EditAlertV2Props): JSX.Element {
	const currentQueryToRedirect = useMemo(() => {
		const basicAlertDef = buildInitialAlertDef(alertType);
		return mapQueryDataFromApi(
			initialAlert?.condition.compositeQuery ||
				basicAlertDef.condition.compositeQuery,
		);
	}, [initialAlert, alertType]);

	useShareBuilderUrl({ defaultValue: currentQueryToRedirect });

	return (
		<>
			<Spinner />
			<div className="create-alert-v2-container">
				<AlertSteps />
			</div>
			<Footer />
		</>
	);
}

EditAlertV2.defaultProps = {
	alertType: AlertTypes.METRICS_BASED_ALERT,
};

export default EditAlertV2;
