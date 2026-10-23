import { useIngestion } from 'pages/GetStarted/hooks/useIngestion';
import { endpointPort } from 'pages/GetStarted/utils';

/** The OTLP ports this FuseScope takes data on, pulsing while nothing arrived. */
function ListeningIndicator(): JSX.Element | null {
	const { ingestion } = useIngestion();
	if (!ingestion) {
		return null;
	}

	return (
		<span
			aria-live="polite"
			data-testid="home-listening"
			className="fs-ui tw:inline-flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-3 tw:py-1.5 tw:font-sans tw:text-[13px]"
		>
			<span
				aria-hidden="true"
				className="tw:size-2.5 tw:flex-none tw:animate-pulse tw:rounded-full tw:bg-primary"
			/>
			<span>
				Listening for OTLP on{' '}
				<code className="tw:font-mono tw:text-xs">
					{endpointPort(ingestion.otlpGrpcEndpoint)}
				</code>{' '}
				and{' '}
				<code className="tw:font-mono tw:text-xs">
					{endpointPort(ingestion.otlpHttpEndpoint)}
				</code>
			</span>
		</span>
	);
}

export default ListeningIndicator;
