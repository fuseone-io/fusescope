import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Database } from 'lucide-react';

interface DbCallsEmptyStateProps {
	onOpenDependencies?: () => void;
}

/** Why the DB calls tab is empty, and how to fill it. */
function DbCallsEmptyState({
	onOpenDependencies,
}: DbCallsEmptyStateProps): JSX.Element {
	return (
		<ContentPanel testId="db-calls-empty">
			<div className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:px-6 tw:py-14 tw:text-center tw:font-sans">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-surface-sunken tw:text-muted-foreground"
				>
					<Database className="tw:size-6" />
				</span>
				<p className="tw:text-base tw:font-semibold">
					No database calls in this range
				</p>
				<p className="tw:max-w-xl tw:text-[13px] tw:text-muted-foreground">
					DB call metrics come from spans that carry{' '}
					<code className="tw:font-mono tw:text-foreground">db.system</code>, as set
					by clients that follow the OpenTelemetry database semantic conventions.
				</p>
				<p className="tw:max-w-xl tw:text-[13px] tw:text-muted-foreground">
					Databases reached through{' '}
					<code className="tw:font-mono tw:text-foreground">peer.service</code> still
					show on the Dependencies tab.
				</p>
				<div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2 tw:pt-1">
					{onOpenDependencies && (
						<Button variant="outline" size="sm" onClick={onOpenDependencies}>
							Open Dependencies
						</Button>
					)}
					<Button asChild variant="ghost" size="sm">
						<a
							href={fuseScopeDocsUrl('/sending-data/instrumentation/')}
							target="_blank"
							rel="noreferrer"
						>
							Instrument your database client
						</a>
					</Button>
				</div>
			</div>
		</ContentPanel>
	);
}

export default DbCallsEmptyState;
