import { Link } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';

import EntryLogo from '../components/CatalogCard/EntryLogo';
import { exporterEndpoint } from '../guides/snippets';
import type { Guide as GuideDefinition, SnippetInput } from '../guides/types';
import { useIngestion } from '../hooks/useIngestion';
import { docsPageUrl, toOtlpEndpoints } from '../utils';
import GuideAside from './components/GuideAside';
import InstallStep from './components/InstallStep';
import RunStep from './components/RunStep';
import ServiceStep from './components/ServiceStep';
import VerifyStep from './components/VerifyStep';
import { useGuideForm } from './hooks/useGuideForm';
import { useWaitForData } from './hooks/useWaitForData';

interface GuideBodyProps {
	guide: GuideDefinition;
}

function GuideBody({ guide }: GuideBodyProps): JSX.Element {
	const form = useGuideForm();
	const { ingestion } = useIngestion();
	const { state, start } = useWaitForData(form.service);

	const input: SnippetInput = {
		service: form.service,
		environment: form.environment,
		route: form.route,
		runtime: form.runtime,
		endpoints: toOtlpEndpoints(ingestion),
	};
	const endpoint = exporterEndpoint(guide.protocol, input);
	const started = state.status !== 'idle';

	return (
		<HeaderBandLayout
			testId="get-started-guide"
			header={
				<CompactPageHeader
					testId="guide-header"
					icon={
						<EntryLogo
							icon={guide.icon}
							initials={guide.initials}
							className="tw:size-8 tw:border-0 tw:bg-transparent"
						/>
					}
					title={guide.title}
					meta={guide.summary}
					actions={
						<>
							<Button asChild variant="ghost">
								<Link
									to={ROUTES.GET_STARTED}
									className="tw:text-foreground! tw:no-underline!"
								>
									<ChevronLeft aria-hidden="true" />
									All sources
								</Link>
							</Button>
							<Button asChild variant="outline">
								<a
									href={docsPageUrl(guide.docsSlug)}
									target="_blank"
									rel="noopener noreferrer"
									data-testid="guide-docs"
									className="tw:text-foreground! tw:no-underline!"
								>
									Full {guide.name} docs
									<ArrowUpRight aria-hidden="true" />
								</a>
							</Button>
						</>
					}
				/>
			}
			bodyClassName="fs-ui tw:px-4 tw:pt-5 tw:pb-12 tw:font-sans tw:text-foreground tw:md:px-6"
		>
			<div className="tw:flex tw:flex-wrap tw:items-start tw:gap-5">
				<div
					aria-label="Guide steps"
					className="tw:flex tw:min-w-0 tw:flex-[999_1_560px] tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised"
				>
					<ServiceStep form={form} done={form.service.trim() !== ''} />
					<InstallStep guide={guide} done={started} />
					<RunStep guide={guide} form={form} input={input} done={started} />
					<VerifyStep
						guide={guide}
						service={form.service.trim()}
						endpoint={endpoint}
						state={state}
						onStart={start}
					/>
				</div>
				<GuideAside guide={guide} endpoint={endpoint} />
			</div>
		</HeaderBandLayout>
	);
}

export default GuideBody;
