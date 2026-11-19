import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { RumIngestionState } from '../hooks/useRumIngestion';

interface IngestionGateProps {
	state: RumIngestionState;
	web?: boolean;
	children: ReactNode;
}

function IngestionGate({
	state,
	web = false,
	children,
}: IngestionGateProps): JSX.Element {
	if (state.status === 'loading') {
		return (
			<span data-testid="rum-ingestion-loading">
				Loading the RUM collector URL…
			</span>
		);
	}
	if (state.status === 'error') {
		return (
			<div
				data-testid="rum-ingestion-error"
				className="tw:flex tw:items-center tw:gap-2"
			>
				<span>Could not load the RUM collector URL.</span>
				<Button
					variant="outline"
					size="sm"
					data-testid="rum-ingestion-retry"
					onClick={state.retry}
				>
					Retry
				</Button>
			</div>
		);
	}
	const url = new URL(state.endpoint);
	return (
		<>
			{state.derived && (
				<span
					data-testid="rum-ingestion-derived"
					className="tw:text-xs tw:text-subtle-foreground"
				>
					Using this UI’s origin as a guess. Confirm that its proxy routes /rum/v1 to
					the collector, or set the RUM URL in Get started.
				</span>
			)}
			{web &&
				url.protocol === 'http:' &&
				!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && (
					<span
						role="alert"
						data-testid="rum-ingestion-mixed-content"
						className="tw:text-xs tw:text-warning-ink"
					>
						HTTP RUM ingestion is blocked as mixed content on HTTPS pages. Use an
						HTTPS collector URL.
					</span>
				)}
			{children}
		</>
	);
}

export default IngestionGate;
