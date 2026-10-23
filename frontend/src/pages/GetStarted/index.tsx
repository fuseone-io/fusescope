import { useEffect, useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import { Button } from 'components/ui/button';
import { ArrowUpRight, PackagePlus } from 'lucide-react';

import CatalogSectionView from './components/CatalogSectionView/CatalogSectionView';
import CatalogToolbar from './components/CatalogToolbar/CatalogToolbar';
import IngestionPanel from './components/IngestionPanel/IngestionPanel';
import NoMatches from './components/NoMatches/NoMatches';
import OtelSnippets from './components/OtelSnippets/OtelSnippets';
import { CATALOG_SECTIONS, OTEL_KEYWORDS } from './constants';
import { useCatalogParams } from './hooks/useCatalogParams';
import { useReceivingIntegrations } from './hooks/useReceivingIntegrations';
import { docsPageUrl, filterCatalog, matchesTerms, queryTerms } from './utils';

const INTEGRATION_IDS = CATALOG_SECTIONS.flatMap((section) =>
	section.entries.flatMap((entry) =>
		entry.integrationId ? [entry.integrationId] : [],
	),
);

/** The data source catalog: where to send, then what to send it from. */
function GetStarted(): JSX.Element {
	const { query, setQuery, filter, setFilter, clear } = useCatalogParams();
	const receivingIntegrations = useReceivingIntegrations(INTEGRATION_IDS);

	const sections = useMemo(
		() => filterCatalog(CATALOG_SECTIONS, query, filter),
		[query, filter],
	);
	const showOtel =
		(filter === 'all' || filter === 'otel') &&
		matchesTerms(OTEL_KEYWORDS, queryTerms(query));

	useEffect(() => {
		void logEvent('Get Started: Visited', {});
	}, []);

	return (
		<HeaderBandLayout
			testId="get-started-page"
			header={
				<CompactPageHeader
					testId="get-started-header"
					icon={<PackagePlus />}
					title="Get started"
					meta="Send traces, metrics and logs to this FuseScope with OpenTelemetry."
					actions={
						<Button asChild variant="outline">
							<a
								href={docsPageUrl('sending-data/data-source-catalog')}
								target="_blank"
								rel="noopener noreferrer"
								className="tw:text-foreground! tw:no-underline!"
							>
								Sending data docs
								<ArrowUpRight aria-hidden="true" />
							</a>
						</Button>
					}
				/>
			}
			bodyClassName="fs-ui tw:gap-5 tw:px-4 tw:pt-5 tw:pb-12 tw:font-sans tw:text-foreground tw:md:px-6"
		>
			<IngestionPanel />
			<CatalogToolbar
				query={query}
				onQueryChange={setQuery}
				filter={filter}
				onFilterChange={setFilter}
			/>
			{sections.map((section) => (
				<CatalogSectionView
					key={section.id}
					section={section}
					receivingIntegrations={receivingIntegrations}
				/>
			))}
			{showOtel && <OtelSnippets />}
			{sections.length === 0 && !showOtel && (
				<NoMatches query={query} onClear={clear} />
			)}
		</HeaderBandLayout>
	);
}

export default GetStarted;
