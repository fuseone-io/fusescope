import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';

import { STATUS_POLL_INTERVAL_MS } from '../../constants';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import { signalSummaries } from '../../utils';
import IngestionEndpoints from '../IngestionEndpoints/IngestionEndpoints';
import SignalStatusStrip from '../SignalStatusStrip/SignalStatusStrip';

const CATALOG_POLL_MS = STATUS_POLL_INTERVAL_MS * 6;

/** Where to send, and whether anything arrived in the last hour. */
function IngestionPanel(): JSX.Element {
	const { status } = useOnboardingStatus({ refetchInterval: CATALOG_POLL_MS });

	return (
		<ContentPanel
			testId="get-started-ingestion"
			title={
				<>
					Your ingestion details
					<StatusBadge tone="neutral">Self-hosted · OTLP</StatusBadge>
				</>
			}
			bodyClassName="fs-ui tw:flex tw:flex-col tw:gap-4 tw:px-5 tw:pb-5 tw:font-sans"
		>
			<IngestionEndpoints />
			<SignalStatusStrip signals={signalSummaries(status, Date.now())} />
			<span className="tw:text-xs tw:text-subtle-foreground">
				Use these values in every guide below. They are filled in for you.
			</span>
		</ContentPanel>
	);
}

export default IngestionPanel;
