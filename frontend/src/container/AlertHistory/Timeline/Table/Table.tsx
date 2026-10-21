import { QuerySearchV2Provider } from 'components/QueryBuilderV2';

import TimelineTableContent from './TimelineTableContent';

export const ALERT_HISTORY_EXPRESSION_KEY = 'alertHistoryExpression';

function TimelineTable(): JSX.Element {
	return (
		<QuerySearchV2Provider
			queryParamKey={ALERT_HISTORY_EXPRESSION_KEY}
			initialExpression=""
			persistOnUnmount
		>
			<TimelineTableContent />
		</QuerySearchV2Provider>
	);
}

export default TimelineTable;
