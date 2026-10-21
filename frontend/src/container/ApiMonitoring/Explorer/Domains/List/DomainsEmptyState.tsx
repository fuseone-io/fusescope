import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Globe } from 'lucide-react';

interface DomainsEmptyStateProps {
	/** Shown when a filter or search narrowed the list; clears them. */
	onClearFilters?: () => void;
}

const INSTRUMENTATION_DOCS = fuseScopeDocsUrl('/sending-data/instrumentation/');

const Code = ({ children }: { children: string }): JSX.Element => (
	<span className="tw:font-mono tw:text-foreground">{children}</span>
);

/** No client spans with a URL in the range, or none left by the filters. */
function DomainsEmptyState({
	onClearFilters,
}: DomainsEmptyStateProps): JSX.Element {
	return (
		<section
			data-testid="api-monitoring-empty"
			aria-label="No external API calls"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-14 tw:text-center tw:font-sans"
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-primary-soft tw:text-primary-ink"
			>
				<Globe className="tw:size-6" />
			</span>
			<h2 className="tw:text-base tw:font-semibold">
				No external API calls detected
			</h2>
			<p className="tw:max-w-[520px] tw:text-[13px] tw:text-muted-foreground">
				FuseScope lists outgoing HTTP calls from spans with kind <Code>Client</Code>{' '}
				and the URL in <Code>url.full</Code> or <Code>http.url</Code>. Check that
				your HTTP client instrumentation sets both, or widen the filters and time
				range.
			</p>
			<div className="tw:flex tw:flex-wrap tw:justify-center tw:gap-2 tw:pt-1">
				{onClearFilters && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onClearFilters}
						data-testid="api-monitoring-clear-filters"
					>
						Clear filters
					</Button>
				)}
				<Button asChild size="sm">
					<a href={INSTRUMENTATION_DOCS} target="_blank" rel="noreferrer">
						Instrument your HTTP clients
					</a>
				</Button>
			</div>
		</section>
	);
}

export default DomainsEmptyState;
