import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import { PartyPopper, Plus } from 'lucide-react';

import { useConnectDataSource } from './useConnectDataSource';

/** Shown until the first signal arrives. */
function WorkspaceReadyPanel(): JSX.Element {
	const connect = useConnectDataSource();

	return (
		<ContentPanel testId="home-workspace-ready">
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:px-5 tw:py-4 tw:font-sans">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-success-soft tw:text-success-ink"
				>
					<PartyPopper className="tw:size-4" />
				</span>
				<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
					<span className="tw:text-sm tw:font-semibold">
						Your workspace is ready
					</span>
					<span className="tw:text-[13px] tw:text-muted-foreground">
						FuseScope is so much better with your data — start by sending your
						telemetry to FuseScope.
					</span>
				</span>
				<Button onClick={connect}>
					<Plus aria-hidden="true" />
					Connect data source
				</Button>
			</div>
		</ContentPanel>
	);
}

export default WorkspaceReadyPanel;
