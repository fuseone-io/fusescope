import { useEffect, useState } from 'react';
import logEvent from 'api/common/logEvent';
import { MarkdownRenderer } from 'components/MarkdownRenderer/MarkdownRenderer';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { INTEGRATION_TELEMETRY_EVENTS } from 'container/Integrations/constants';
import { cn } from 'lib/utils';

import { LEGACY_BODY_CLASS } from './constants';

interface ConfigurationProps {
	configuration: Array<{ title: string; instructions: string }>;
	integrationId: string;
}

function Configure(props: ConfigurationProps): JSX.Element {
	const { configuration, integrationId } = props;
	const [selectedConfigStep, setSelectedConfigStep] = useState(0);

	const handleStepClick = (index: number): void => {
		setSelectedConfigStep(index);
		logEvent('Integrations Detail Page: Configure tab', {
			sectionName: configuration[index]?.title,
			integrationId,
		});
	};

	useEffect(() => {
		logEvent(
			INTEGRATION_TELEMETRY_EVENTS.INTEGRATIONS_DETAIL_CONFIGURE_INSTRUCTION,
			{
				integration: integrationId,
			},
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const selectedStep = configuration[selectedConfigStep];

	const markdownDetailsForTracking = {
		trackingTitle: `Integrations Detail Page: Copy button`,
		sectionName: selectedStep.title,
		integrationId,
	};

	return (
		<div
			data-testid="integration-configure"
			className="tw:grid tw:items-start tw:gap-4 tw:lg:grid-cols-[260px_minmax(0,1fr)]"
		>
			<ContentPanel
				title="Steps"
				divided
				className="tw:lg:sticky tw:lg:top-4"
				testId="integration-configure-steps"
			>
				<ol className="fs-ui tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-0.5 tw:p-2 tw:font-sans">
					{configuration.map((config, index) => {
						const active = selectedConfigStep === index;
						return (
							<li key={config.title}>
								<button
									type="button"
									aria-current={active ? 'step' : undefined}
									onClick={(): void => handleStepClick(index)}
									className={cn(
										'configure-menu-item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-md tw:px-3 tw:py-2 tw:text-left tw:text-[13px] tw:transition-colors tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none',
										active
											? 'active tw:bg-primary-soft tw:font-medium tw:text-primary-ink'
											: 'tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground',
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											'tw:flex tw:size-5 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:border tw:text-[11px] tw:tabular-nums',
											active
												? 'tw:border-primary tw:bg-primary tw:text-primary-foreground'
												: 'tw:border-border',
										)}
									>
										{index + 1}
									</span>
									<span className="tw:min-w-0 tw:text-pretty">{config.title}</span>
								</button>
							</li>
						);
					})}
				</ol>
			</ContentPanel>
			<ContentPanel
				title={selectedStep.title}
				subtitle={`Step ${selectedConfigStep + 1} of ${configuration.length}`}
				divided
				bodyClassName={cn('tw:px-5 tw:py-4', LEGACY_BODY_CLASS)}
			>
				<MarkdownRenderer
					variables={{}}
					markdownContent={selectedStep.instructions}
					elementDetails={markdownDetailsForTracking}
					trackCopyAction
				/>
			</ContentPanel>
		</div>
	);
}

export default Configure;
