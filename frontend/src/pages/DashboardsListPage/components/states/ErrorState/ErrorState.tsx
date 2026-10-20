import { Button } from 'components/ui/button';
import { ArrowUpRight, RotateCw, TriangleAlert } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { handleContactSupport } from 'container/Integrations/utils';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import { formatQueryErrorMessage } from '../../../utils/helpers';
import StateCard from '../StateCard';

interface Props {
	isCloudUser: boolean;
	onRetry: () => void;
	httpStatus?: number;
	errorMessage?: string;
}

const GENERIC_MESSAGE =
	'Something went wrong :/ Please retry or contact support.';
const INVALID_QUERY_FALLBACK = 'Please review the syntax and try again.';

function ErrorState({
	isCloudUser,
	onRetry,
	httpStatus,
	errorMessage,
}: Props): JSX.Element {
	// 4xx responses are client errors — the same request will keep failing.
	// Surface the BE-provided detail (e.g. DSL parse errors) and skip Retry.
	const isClientError =
		httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500;

	const cleanedDetail = formatQueryErrorMessage(errorMessage);

	const handleRetry = (): void => {
		void logEvent(DashboardListEvents.ErrorStateAction, {
			action: 'retry',
		});
		onRetry();
	};

	const handleContactSupportClick = (): void => {
		void logEvent(DashboardListEvents.ErrorStateAction, {
			action: 'contactSupport',
		});
		handleContactSupport(isCloudUser);
	};

	return (
		<StateCard
			testId="dashboards-error-state"
			tone="error"
			icon={<TriangleAlert />}
			title={isClientError ? 'Invalid query' : GENERIC_MESSAGE}
			description={
				isClientError ? cleanedDetail || INVALID_QUERY_FALLBACK : undefined
			}
			actions={
				<>
					{!isClientError && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="dashboards-list-retry"
							className="tw:border-input tw:bg-surface-raised tw:dark:bg-surface-raised"
							onClick={handleRetry}
						>
							<RotateCw />
							Retry
						</Button>
					)}
					<Button
						type="button"
						variant="link"
						size="sm"
						data-testid="dashboards-list-contact-support"
						className="tw:px-1"
						onClick={handleContactSupportClick}
					>
						Contact Support
						<ArrowUpRight />
					</Button>
				</>
			}
		/>
	);
}

export default ErrorState;
