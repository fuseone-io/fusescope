import Panel from 'components/PageTemplate/components/Panel';
import { fuseScopeDocsUrl } from 'constants/docs';

/** Why the DB Call Metrics tab is empty, and how to fill it. */
function DbCallsEmptyState(): JSX.Element {
	return (
		<Panel testId="db-calls-empty">
			<div className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-1 tw:px-5 tw:py-12 tw:text-center tw:font-sans">
				<p className="tw:text-sm tw:font-medium">No database calls in this range</p>
				<p className="tw:max-w-xl tw:text-[13px] tw:text-muted-foreground">
					DB call metrics come from spans that carry{' '}
					<code className="tw:font-mono">db.system</code>, as set by clients that
					follow the OpenTelemetry database semantic conventions.{' '}
					<a
						href={fuseScopeDocsUrl('/sending-data/instrumentation/')}
						target="_blank"
						rel="noreferrer"
						className="tw:text-primary! tw:hover:underline"
					>
						Instrument your database client
					</a>
				</p>
			</div>
		</Panel>
	);
}

export default DbCallsEmptyState;
