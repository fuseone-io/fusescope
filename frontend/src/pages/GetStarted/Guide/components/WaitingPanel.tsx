import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';

import { useIngestion } from '../../hooks/useIngestion';
import type { Guide } from '../../guides/types';
import CheckItem from './CheckItem';

interface WaitingPanelProps {
	guide: Guide;
	service: string;
	endpoint: string;
	status: OnboardingtypesStatusDTO | undefined;
}

/** Polling, with what to check when nothing shows up. */
function WaitingPanel({
	guide,
	service,
	endpoint,
	status,
}: WaitingPanelProps): JSX.Element {
	const { ingestion } = useIngestion();
	const collectorUp = ingestion?.collector?.reachable === true;

	return (
		<section
			aria-live="polite"
			aria-labelledby="guide-waiting-title"
			data-testid="guide-waiting"
			className="tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-sunken tw:p-4"
		>
			<div className="tw:flex tw:items-center tw:gap-2.5">
				<span
					aria-hidden="true"
					className="tw:size-2.5 tw:flex-none tw:animate-pulse tw:rounded-full tw:bg-primary"
				/>
				<h3 id="guide-waiting-title" className="tw:text-sm tw:font-semibold">
					Waiting for data from{' '}
					<span className="tw:font-mono tw:font-medium">{service}</span>…
				</h3>
			</div>
			<p className="tw:text-[13px] tw:text-muted-foreground">
				Send a request to your app. This checks again every 5 seconds.
			</p>
			<div className="tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-2">
				{collectorUp && <CheckItem done label="Collector up" />}
				<CheckItem done={Boolean(status?.traces?.received)} label="First span" />
				<CheckItem done={Boolean(status?.metrics?.received)} label="First metric" />
				<CheckItem done={Boolean(status?.logs?.received)} label="First log" />
			</div>
			<details data-testid="guide-troubleshooting" className="tw:text-[13px]">
				<summary className="tw:cursor-pointer tw:font-medium">
					Nothing after 2 minutes?
				</summary>
				<ul className="tw:mt-2 tw:flex tw:list-disc tw:flex-col tw:gap-1.5 tw:pl-5 tw:text-muted-foreground">
					{guide.protocol === 'grpc' ? (
						<li>
							Check that <code className="tw:font-mono tw:text-xs">{endpoint}</code> is
							reachable from the app host on port 4317: the gRPC exporters do not speak
							OTLP/HTTP.
						</li>
					) : (
						<li>
							From the app host, run{' '}
							<code className="tw:font-mono tw:text-xs">
								curl -i {endpoint}/v1/traces
							</code>
							. Expect <code className="tw:font-mono tw:text-xs">405</code>, not a
							timeout.
						</li>
					)}
					<li>
						Set <code className="tw:font-mono tw:text-xs">OTEL_LOG_LEVEL=debug</code>{' '}
						to see exporter errors.
					</li>
					<li>
						Check that the service name above matches{' '}
						<code className="tw:font-mono tw:text-xs">OTEL_SERVICE_NAME</code>.
					</li>
				</ul>
			</details>
		</section>
	);
}

export default WaitingPanel;
