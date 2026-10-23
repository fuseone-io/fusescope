import { Button } from 'components/ui/button';

interface NoMatchesProps {
	query: string;
	onClear: () => void;
}

function NoMatches({ query, onClear }: NoMatchesProps): JSX.Element {
	return (
		<section
			aria-live="polite"
			data-testid="catalog-no-matches"
			className="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-5"
		>
			<h2 className="tw:text-[15px] tw:font-semibold">
				No guide matches “{query.trim()}”
			</h2>
			<p className="tw:text-[13px] tw:text-muted-foreground">
				Anything that speaks OTLP works. Use the endpoint above, or check the
				OpenTelemetry registry for an instrumentation.
			</p>
			<div className="tw:flex tw:flex-wrap tw:gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={onClear}
					data-testid="catalog-clear"
				>
					Clear search
				</Button>
				<Button asChild variant="ghost" size="sm">
					<a
						href="https://opentelemetry.io/ecosystem/registry/"
						target="_blank"
						rel="noopener noreferrer"
					>
						OpenTelemetry registry
					</a>
				</Button>
			</div>
		</section>
	);
}

export default NoMatches;
