import { useTranslation } from 'react-i18next';

import { conditionSummary } from './summary';
import { ConditionSummaryInput } from './types';

function ConditionSummary(props: ConditionSummaryInput): JSX.Element {
	const { t } = useTranslation('alerts');

	return (
		<p
			aria-live="polite"
			data-testid="alert-condition-summary"
			className="fs-ui tw:m-0 tw:rounded-md tw:bg-muted tw:px-3 tw:py-2 tw:font-sans tw:text-sm tw:text-muted-foreground"
		>
			{conditionSummary(props, t)}
		</p>
	);
}

export default ConditionSummary;
