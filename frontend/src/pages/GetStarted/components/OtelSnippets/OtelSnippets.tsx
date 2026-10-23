import { Workflow } from 'lucide-react';

import {
	collectorExporterSnippet,
	otelEnvSnippet,
} from '../../guides/snippets';
import { useIngestion } from '../../hooks/useIngestion';
import { docsPageUrl } from '../../utils';
import SectionHeading from '../CatalogSectionView/SectionHeading';
import CodeSnippet from '../CodeSnippet/CodeSnippet';

const FALLBACK_ENDPOINT = 'http://localhost:4318';

/** Exporter settings for apps and collectors that already speak OTLP. */
function OtelSnippets(): JSX.Element {
	const { ingestion } = useIngestion();
	const endpoint = ingestion?.otlpHttpEndpoint ?? FALLBACK_ENDPOINT;

	return (
		<section
			aria-labelledby="get-started-otel"
			data-testid="get-started-otel"
			className="tw:flex tw:flex-col tw:gap-4 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-5"
		>
			<SectionHeading
				id="get-started-otel"
				icon={<Workflow />}
				title="Already using OpenTelemetry?"
				subtitle="Point any OTLP exporter or collector at this FuseScope. No FuseScope SDK needed."
				action={
					<a
						href={docsPageUrl('sending-data/otlp')}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:text-[13px] tw:font-medium tw:text-primary!"
					>
						OTLP reference
					</a>
				}
			/>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] tw:gap-3">
				<CodeSnippet
					label="SDK exporter · environment"
					code={otelEnvSnippet(endpoint)}
					copyLabel="Copy environment variables"
					testId="otel-env-snippet"
				/>
				<CodeSnippet
					label="Your own collector · otel-collector.yaml"
					code={collectorExporterSnippet(endpoint)}
					copyLabel="Copy collector exporter"
					testId="otel-collector-snippet"
				/>
			</div>
		</section>
	);
}

export default OtelSnippets;
