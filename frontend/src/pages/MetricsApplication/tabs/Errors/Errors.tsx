import { useServiceErrors } from 'container/MetricsApplication/hooks/useServiceErrors';

import ErrorMessages from './ErrorMessages';
import ErrorSummaryStrip from './ErrorSummaryStrip';
import TopExceptions from './TopExceptions';

interface ErrorsProps {
	servicename: string;
}

/** The service's errors: summary, top exceptions and status messages. */
function Errors({ servicename }: ErrorsProps): JSX.Element {
	const { exceptions, messages, summary, isLoading } =
		useServiceErrors(servicename);
	return (
		<div className="tw:flex tw:flex-col tw:gap-4">
			<ErrorSummaryStrip summary={summary} />
			<TopExceptions
				servicename={servicename}
				exceptions={exceptions}
				isLoading={isLoading}
			/>
			<ErrorMessages
				servicename={servicename}
				rows={messages}
				isLoading={isLoading}
			/>
		</div>
	);
}

export default Errors;
