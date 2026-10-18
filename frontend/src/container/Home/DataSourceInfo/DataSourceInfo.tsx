import { ReactNode, useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import { useGetHosts } from 'api/generated/services/zeus';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { House, Link2, PartyPopper, Plus } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { openInNewTab } from 'utils/navigation';

import { DOCS_LINKS } from '../constants';

const TITLE = 'Hello there, Welcome to your FuseScope workspace';

function DataSourceInfo({
	dataSentToSigNoz,
	isLoading,
	actions,
}: {
	dataSentToSigNoz: boolean;
	isLoading: boolean;
	/** Extra header actions, after the workspace URL. */
	actions?: ReactNode;
}): JSX.Element {
	const { activeLicense } = useAppContext();

	const notSendingData = !dataSentToSigNoz;

	const isEnabled =
		activeLicense && activeLicense.platform === LicensePlatform.CLOUD;

	const { data: hostsData, isError } = useGetHosts({
		query: { enabled: isEnabled || false },
	});

	const activeHost = useMemo(
		() =>
			hostsData?.data?.hosts?.find((h) => !h.is_default) ??
			hostsData?.data?.hosts?.find((h) => h.is_default),
		[hostsData],
	);

	const url = useMemo(
		() => activeHost?.url?.split('://')[1] ?? '',
		[activeHost],
	);

	const handleConnect = (): void => {
		void logEvent('Homepage: Connect dataSource clicked', {});

		if (activeLicense && activeLicense.platform === LicensePlatform.CLOUD) {
			history.push(ROUTES.GET_STARTED_WITH_CLOUD);
		} else {
			openInNewTab(DOCS_LINKS.ADD_DATA_SOURCE);
		}
	};

	const workspaceUrl = !isLoading && !isError && hostsData && (
		<span
			data-testid="home-workspace-url"
			className="tw:inline-flex tw:h-9 tw:items-center tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-surface-raised tw:px-3 tw:font-mono tw:text-xs tw:text-foreground"
		>
			<Link2
				aria-hidden="true"
				className="tw:size-3.5 tw:text-subtle-foreground"
			/>
			{url}
		</span>
	);

	let description: ReactNode;
	if (isLoading) {
		description = <Skeleton className="tw:h-4 tw:w-80 tw:bg-muted" />;
	} else if (notSendingData) {
		description = (
			<>
				You’re not sending any data yet. <br />
				FuseScope is so much better with your data ⎯ start by sending your telemetry
				data to FuseScope.
			</>
		);
	}

	return (
		<>
			<PageHeader
				icon={<House />}
				title={TITLE}
				description={description}
				actions={
					(workspaceUrl || actions) && (
						<>
							{workspaceUrl}
							{actions}
						</>
					)
				}
			/>

			{!isLoading && notSendingData && (
				<Panel testId="home-workspace-ready">
					<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:px-5 tw:py-4 tw:font-sans">
						<span
							aria-hidden="true"
							className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-success-soft tw:text-success-ink"
						>
							<PartyPopper className="tw:size-4" />
						</span>
						<span className="tw:flex-1 tw:text-sm tw:font-semibold">
							Your workspace is ready
						</span>
						<Button onClick={handleConnect}>
							<Plus aria-hidden="true" />
							Connect Data Source
						</Button>
					</div>
				</Panel>
			)}
		</>
	);
}

export default DataSourceInfo;
