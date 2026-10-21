import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { fuseScopeDocsUrl } from 'constants/docs';
import { ArrowUpRight, Sparkles } from 'lucide-react';

const INSTRUMENTATION_DOCS = fuseScopeDocsUrl('/sending-data/instrumentation/');
const MAPPING_TEST_ROUTE = `${ROUTES.AI_OBSERVABILITY_ATTRIBUTE_MAPPING}?tab=test`;

const linkClass =
	'tw:inline-flex tw:items-center tw:gap-0.5 tw:font-medium tw:text-primary-ink tw:underline-offset-2 tw:hover:underline';

interface Step {
	key: string;
	title: string;
	body: ReactNode;
}

const STEPS: Step[] = [
	{
		key: 'instrument',
		title: '1 · Instrument',
		body: (
			<>
				Add an OpenTelemetry GenAI instrumentation to the service that calls the
				model.{' '}
				<a
					href={INSTRUMENTATION_DOCS}
					target="_blank"
					rel="noopener noreferrer"
					className={linkClass}
					data-testid="llm-empty-state-docs"
				>
					Instrumentation guide
					<ArrowUpRight aria-hidden="true" className="tw:size-3.5" />
				</a>
			</>
		),
	},
	{
		key: 'mappings',
		title: '2 · Check mappings',
		body: (
			<>
				Paste a sample span in{' '}
				<Link
					to={MAPPING_TEST_ROUTE}
					className={linkClass}
					data-testid="llm-empty-state-mapping-test"
				>
					Attribute mapping › Test
				</Link>{' '}
				to see what is picked up.
			</>
		),
	},
	{
		key: 'pricing',
		title: '3 · Price models',
		body: (
			<>
				Cost appears once each model has pricing. Models seen without it are listed
				in{' '}
				<Link
					to={ROUTES.AI_OBSERVABILITY_CONFIGURATION}
					className={linkClass}
					data-testid="llm-empty-state-pricing"
				>
					Model pricing
				</Link>
				.
			</>
		),
	},
];

/** Onboarding for a window with no LLM, tool or agent spans. */
function LLMEmptyState(): JSX.Element {
	return (
		<section
			aria-label="No AI traces yet"
			data-testid="llm-empty-state"
			className="fs-ui tw:mx-auto tw:my-4 tw:flex tw:w-full tw:max-w-[960px] tw:flex-col tw:items-center tw:gap-6 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-10 tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:max-w-[560px] tw:flex-col tw:items-center tw:gap-3 tw:text-center">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-xl tw:bg-primary-soft tw:text-primary-ink"
				>
					<Sparkles className="tw:size-6" />
				</span>
				<h2 className="tw:text-base tw:font-semibold">
					No LLM, tool or agent spans yet
				</h2>
				<p className="tw:text-[13px] tw:text-muted-foreground">
					This page fills in once spans carry{' '}
					<code className="tw:font-mono tw:text-foreground">
						gen_ai.request.model
					</code>
					, <code className="tw:font-mono tw:text-foreground">gen_ai.tool.name</code>{' '}
					or{' '}
					<code className="tw:font-mono tw:text-foreground">gen_ai.agent.name</code>.
					SDKs that use other attribute names are brought onto these by attribute
					mappings.
				</p>
			</div>
			<ol className="tw:grid tw:w-full tw:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] tw:gap-3">
				{STEPS.map((step) => (
					<li
						key={step.key}
						className="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-border tw:px-4 tw:py-3.5"
					>
						<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
							{step.title}
						</span>
						<span className="tw:text-[13px]">{step.body}</span>
					</li>
				))}
			</ol>
		</section>
	);
}

export default LLMEmptyState;
