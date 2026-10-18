import { signozDocsUrl } from 'constants/docs';
import { Info } from 'lucide-react';

function TopLevelOperationsInfo(): JSX.Element {
	return (
		<div
			role="note"
			data-testid="top-level-operations-info"
			className="fs-ui tw:flex tw:gap-3 tw:rounded-lg tw:bg-primary-soft tw:px-4 tw:py-3 tw:font-sans tw:text-[13px] tw:leading-relaxed tw:text-primary-ink"
		>
			<Info aria-hidden="true" className="tw:mt-0.5 tw:size-4 tw:flex-none" />
			<div>
				FuseScope calculates the RED metrics for a service using the entry-point
				spans. For more details, you can check out our
				<a
					href={signozDocsUrl('/userguide/metrics/')}
					target="_blank"
					rel="noreferrer"
					className="tw:font-medium tw:underline"
				>
					{' '}
					docs
				</a>
				. We expect the number of unique entry-point operations to be no more than
				2500. The high number of top level operations might be due to an
				instrumentation issue in your service. Below table shows the sample top
				level operations. Please refer to official docs for span name guidelines{' '}
				<a
					href="https://opentelemetry.io/docs/specs/otel/trace/api/#span"
					target="_blank"
					rel="noreferrer"
					className="tw:font-medium tw:underline"
				>
					{' '}
					here
				</a>{' '}
				and update the instrumentation to to follow the guidelines. If there are any
				dynamic IDs in the span name, make sure to use the span attributes instead.
				If you have more questions, please reach out to us via support.
			</div>
		</div>
	);
}

export default TopLevelOperationsInfo;
