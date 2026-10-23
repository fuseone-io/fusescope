import { initialQueriesMap } from 'constants/queryBuilder';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';
import useUrlQuery from 'hooks/useUrlQuery';
import { rumAlertTemplateFromUrl } from 'lib/rum/alertTemplates';
import { mapQueryDataFromApi } from 'lib/newQueryBuilder/queryBuilderMappers/mapQueryDataFromApi';

import AlertSteps from './AlertSteps';
import { CreateAlertProvider } from './context';
import { buildInitialAlertDef } from './context/utils';
import CreateAlertHeader from './CreateAlertHeader';
import Footer from './Footer';
import RumTemplatePicker from './RumTemplates/RumTemplatePicker';
import { CreateAlertV2Props } from './types';
import { Spinner } from './utils';

import './CreateAlertV2.styles.scss';

function CreateAlertV2({ alertType }: CreateAlertV2Props): JSX.Element {
	const queryToRedirect = buildInitialAlertDef(alertType);
	const currentQueryToRedirect = mapQueryDataFromApi(
		queryToRedirect.condition.compositeQuery,
	);

	useShareBuilderUrl({ defaultValue: currentQueryToRedirect });

	// A new template starts the rule over, its name included.
	const template = rumAlertTemplateFromUrl(useUrlQuery());
	const templateKey = template
		? `${template.template}:${template.applicationId}`
		: 'blank';

	return (
		<CreateAlertProvider key={templateKey} initialAlertType={alertType}>
			<Spinner />
			<div className="tw:flex tw:min-h-full tw:w-full tw:flex-1 tw:flex-col tw:self-start tw:bg-background tw:text-foreground">
				<CreateAlertHeader />
				<div className="create-alert-v2-container tw:mx-auto tw:box-border tw:w-full tw:max-w-[1600px] tw:flex-1 tw:px-4 tw:pt-5 tw:md:px-6">
					<RumTemplatePicker />
					<AlertSteps />
				</div>
				<Footer />
			</div>
		</CreateAlertProvider>
	);
}

CreateAlertV2.defaultProps = {
	initialQuery: initialQueriesMap.metrics,
};

export default CreateAlertV2;
