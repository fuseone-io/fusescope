import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import ExceptionServiceCell from 'container/AllError/ExceptionServiceCell';
import { useServiceKinds } from 'lib/apm/useServiceKinds';
import { Bug } from 'lucide-react';
import { PayloadProps as ErrorEvent } from 'types/api/errors/getByErrorTypeAndService';

interface ErrorDetailsHeaderProps {
	event: ErrorEvent;
}

/** The exception's type and service on one line, its message under them. */
function ErrorDetailsHeader({ event }: ErrorDetailsHeaderProps): JSX.Element {
	const serviceIdentity = useServiceKinds();

	return (
		<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5">
			<CompactPageHeader
				testId="error-details-header"
				icon={<Bug />}
				iconTone="error"
				titleMono
				title={<span title={event.exceptionType}>{event.exceptionType}</span>}
				meta={
					event.serviceName && (
						<ExceptionServiceCell
							serviceName={event.serviceName}
							identity={serviceIdentity(event.serviceName)}
						/>
					)
				}
			/>
			{event.exceptionMessage && (
				<p
					data-testid="error-details-message"
					className="fs-ui tw:m-0 tw:pl-11 tw:font-mono tw:text-xs tw:break-all tw:text-muted-foreground"
				>
					{event.exceptionMessage}
				</p>
			)}
		</div>
	);
}

export default ErrorDetailsHeader;
