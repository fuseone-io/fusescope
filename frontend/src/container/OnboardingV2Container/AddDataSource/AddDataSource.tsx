import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { Button as SignozButton } from '@signozhq/ui/button';
import { toast } from '@signozhq/ui/sonner';
import logEvent from 'api/common/logEvent';
import { useGetGlobalConfig } from 'api/generated/services/global';
import InviteMembers from 'components/InviteMembers/InviteMembers';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Skeleton } from 'components/ui/skeleton';
import { DOCS_BASE_URL, fuseScopeDocsUrl } from 'constants/docs';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import useDebouncedFn from 'hooks/useDebouncedFunction';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import { isEmpty } from 'lodash-es';
import {
	ArrowRight,
	Cable,
	Check,
	Search as SearchIcon,
	X,
} from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { isModifierKeyPressed } from 'utils/app';

import fuseScopeBrandLogoUrl from '@/assets/Logos/fusescope-brand-logo.svg';

import OnboardingIngestionDetails from '../IngestionDetails/IngestionDetails';
import onboardingConfigWithLinks from '../onboarding-configs/onboarding-config-with-links';
import CategoryFilters from './CategoryFilters';
import DataSourceOption from './DataSourceOption';
import QuestionSection from './QuestionSection';
import RequestDataSource from './RequestDataSource';
import SetupFlowHeader from './SetupFlowHeader';

import '../OnboardingV2.styles.scss';

interface OptionGroup {
	id: string;
	category: string;
	items: string[];
}

export interface Question {
	id: string;
	title: string;
	description: string;
	options: OptionGroup[];
	uiConfig?: {
		showSearch?: boolean;
		filterByCategory?: boolean;
	};
}

interface Option {
	imgUrl?: string;
	label: string;
	link?: string;
	entityID?: string;
	internalRedirect?: boolean;
	question?: {
		desc: string;
		options: Option[];
		entityID?: string;
		helpText?: string;
		helpLink?: string;
		helpLinkText?: string;
	};
}

interface Entity {
	imgUrl?: string;
	label: string;
	dataSource: string;
	entityID: string;
	module: string;
	question?: {
		desc: string;
		options: Option[];
		entityID: string;
		helpText?: string;
		helpLink?: string;
		helpLinkText?: string;
		question?: {
			desc: string;
			options: Option[];
			entityID: string;
		};
	};
	tags: string[];
	relatedSearchKeywords?: string[];
	link?: string;
	internalRedirect?: boolean;
}

const setupStepItemsBase = [
	{
		title: 'Org Setup',
		description: ' ',
	},
	{
		title: 'Add your first data source',
		description: ' ',
	},
	{
		title: 'Configure Your Product',
		description: ' ',
	},
];

const ONBOARDING_V3_ANALYTICS_EVENTS_MAP = {
	BASE: 'Onboarding V3',
	STARTED: 'Started',
	DATA_SOURCE_SELECTED: 'Datasource selected',
	FRAMEWORK_SELECTED: 'Framework selected',
	ENVIRONMENT_SELECTED: 'Environment selected',
	CONFIGURED_PRODUCT: 'Configure clicked',
	BACK_BUTTON_CLICKED: 'Back clicked',
	CONTINUE_BUTTON_CLICKED: 'Continue clicked',
	GET_HELP_BUTTON_CLICKED: 'Get help clicked',
	GET_EXPERT_ASSISTANCE_BUTTON_CLICKED: 'Get expert assistance clicked',
	INVITE_TEAM_MEMBER_BUTTON_CLICKED: 'Invite team member clicked',
	INVITE_TEAM_MEMBER_SEND_CLICKED: 'Send invites clicked',
	INVITE_TEAM_MEMBER_SUCCESS: 'Invite team members success',
	INVITE_TEAM_MEMBER_PARTIAL_SUCCESS: 'Invite team members partial success',
	INVITE_TEAM_MEMBER_FAILED: 'Invite team members failed',
	CLOSE_ONBOARDING_CLICKED: 'Close onboarding clicked',
	DATA_SOURCE_REQUESTED: 'Datasource requested',
	DATA_SOURCE_SEARCHED: 'Searched',
};

const groupDataSourcesByTags = (
	dataSources: Entity[],
): { [tag: string]: Entity[] } => {
	const groupedDataSources: { [tag: string]: Entity[] } = {};

	dataSources.forEach((dataSource) => {
		dataSource.tags.forEach((tag) => {
			if (!groupedDataSources[tag]) {
				groupedDataSources[tag] = [];
			}
			groupedDataSources[tag].push(dataSource);
		});
	});

	return groupedDataSources;
};

const allGroupedDataSources = groupDataSourcesByTags(
	onboardingConfigWithLinks as Entity[],
);

// eslint-disable-next-line sonarjs/cognitive-complexity
function OnboardingAddDataSource(): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const urlQuery = useUrlQuery();
	const [groupedDataSources, setGroupedDataSources] = useState<{
		[tag: string]: Entity[];
	}>(allGroupedDataSources);

	const { org } = useAppContext();

	const { data: globalConfig } = useGetGlobalConfig();

	const [setupStepItems, setSetupStepItems] = useState(setupStepItemsBase);

	const [searchQuery, setSearchQuery] = useState<string>('');

	const question2Ref = useRef<HTMLDivElement | null>(null);
	const question3Ref = useRef<HTMLDivElement | null>(null);
	const configureProdRef = useRef<HTMLDivElement | null>(null);

	const [showConfigureProduct, setShowConfigureProduct] =
		useState<boolean>(false);

	const [currentStep, setCurrentStep] = useState(1);

	const [dataSourceRequest, setDataSourceRequest] = useState<string>('');

	const [hasMoreQuestions, setHasMoreQuestions] = useState<boolean>(true);

	const [showRequestDataSourceModal, setShowRequestDataSourceModal] =
		useState<boolean>(false);

	const [showInviteTeamMembersModal, setShowInviteTeamMembersModal] =
		useState<boolean>(false);

	const [docsUrl, setDocsUrl] = useState<string>(
		fuseScopeDocsUrl('/sending-data/instrumentation/'),
	);

	const [selectedDataSource, setSelectedDataSource] = useState<Entity | null>(
		null,
	);

	const [selectedFramework, setSelectedFramework] = useState<Entity | null>(
		null,
	);

	const [selectedEnvironment, setSelectedEnvironment] = useState<Entity | null>(
		null,
	);

	const [selectedCategory, setSelectedCategory] = useState<string>('All');

	const [dataSourceRequestSubmitted, setDataSourceRequestSubmitted] =
		useState<boolean>(false);

	const handleScrollToStep = (ref: React.RefObject<HTMLDivElement>): void => {
		setTimeout(() => {
			ref.current?.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
				inline: 'nearest',
			});
		}, 100);
	};

	const getStartedSource = urlQuery.get(QueryParams.getStartedSource);
	const getStartedSourceService = urlQuery.get(
		QueryParams.getStartedSourceService,
	);

	useEffect(() => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.STARTED}`,
			{},
		);
	}, []);

	const orgName = org?.[0]?.displayName;

	useEffect(() => {
		if (!getStartedSource || selectedDataSource) {
			return;
		}

		const matchingDataSource = onboardingConfigWithLinks.find(
			(ds) => ds.dataSource === getStartedSource,
		) as Entity | undefined;

		if (!matchingDataSource) {
			return;
		}

		setSelectedDataSource(matchingDataSource);
		setHasMoreQuestions(false);
		updateUrl(matchingDataSource.link || '', null);
		setCurrentStep(2);
		setSetupStepItems([
			{
				...setupStepItemsBase[0],
				description: orgName || '',
			},
			{
				...setupStepItemsBase[1],
				description: matchingDataSource.label,
			},
			...setupStepItemsBase.slice(2),
		]);

		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.DATA_SOURCE_SELECTED}`,
			{
				dataSource: matchingDataSource.label,
				source: 'query_param',
			},
		);
		// oxlint-disable-next-line react-hooks/exhaustive-deps Ignore update url since it's not stable
	}, [getStartedSource, orgName, selectedDataSource]);

	const updateUrl = (url: string, selectedEnvironment: string | null): void => {
		if (!url || url === '') {
			return;
		}

		// Step 1: Parse the URL
		const fullUrl = url.startsWith('/') ? `${DOCS_BASE_URL}${url}` : url;

		const urlObj = new URL(fullUrl);

		// Step 2: Update or add the 'source' parameter
		urlObj.searchParams.set('source', 'onboarding');

		if (selectedEnvironment) {
			urlObj.searchParams.set('environment', selectedEnvironment);
		}

		if (getStartedSourceService) {
			urlObj.searchParams.set('service', getStartedSourceService);
		}

		const ingestionUrl = globalConfig?.data?.ingestion_url;

		if (ingestionUrl) {
			const parts = ingestionUrl.split('.');
			if (parts?.length > 1 && parts[0]?.includes('ingest')) {
				const region = parts[1];
				urlObj.searchParams.set('region', region);
			}
		}

		// Step 3: Return the updated URL as a string
		const updatedUrl = urlObj.toString();

		setDocsUrl(updatedUrl);
	};

	const handleSelectDataSource = (dataSource: Entity): void => {
		setSelectedDataSource(dataSource);
		setSelectedFramework(null);
		setSelectedEnvironment(null);

		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.DATA_SOURCE_SELECTED}`,
			{
				dataSource: dataSource.label,
			},
		);

		if (dataSource.question) {
			setHasMoreQuestions(true);

			setTimeout(() => {
				handleScrollToStep(question2Ref);
			}, 100);
		} else {
			setHasMoreQuestions(false);

			updateUrl(dataSource?.link || '', null);

			setShowConfigureProduct(true);
		}
	};

	const handleSelectFramework = (option: any): void => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.FRAMEWORK_SELECTED}`,
			{
				dataSource: selectedDataSource?.label,
				framework: option.label,
			},
		);

		setSelectedFramework(option);

		if (option.question) {
			setHasMoreQuestions(true);

			updateUrl(option?.link, null);

			setTimeout(() => {
				handleScrollToStep(question3Ref);
			}, 100);
		} else {
			updateUrl(option.link, null);
			setHasMoreQuestions(false);

			setShowConfigureProduct(true);
		}
	};

	// Base Assumption:
	// Environment is the last question in the onboarding flow and no more question will be shown regarless of the configuration
	// We will have to handle this in the future
	const handleSelectEnvironment = (
		selectedEnvironment: any,
		baseURL?: string,
	): void => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.ENVIRONMENT_SELECTED}`,
			{
				dataSource: selectedDataSource?.label,
				framework: selectedFramework?.label,
				environment: selectedEnvironment?.label,
			},
		);

		setSelectedEnvironment(selectedEnvironment);
		setHasMoreQuestions(false);

		updateUrl(baseURL || docsUrl, selectedEnvironment?.key);

		setShowConfigureProduct(true);
	};

	const debouncedUpdate = useDebouncedFn((query) => {
		setSearchQuery(query as string);

		setDataSourceRequestSubmitted(false);

		if (query === '') {
			setGroupedDataSources(allGroupedDataSources);
			return;
		}

		const filteredDataSources = onboardingConfigWithLinks.filter(
			(dataSource) =>
				dataSource.label.toLowerCase().includes(query as string) ||
				dataSource.tags.some((tag) =>
					tag.toLowerCase().includes(query as string),
				) ||
				dataSource.relatedSearchKeywords?.some((keyword) =>
					keyword?.toLowerCase().includes(query as string),
				),
		);

		setGroupedDataSources(
			groupDataSourcesByTags(filteredDataSources as Entity[]),
		);

		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.DATA_SOURCE_SEARCHED}`,
			{
				searchedDataSource: query,
				resultCount: filteredDataSources.length,
			},
		);
	}, 300);

	const handleSearch = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>): void => {
			const query = e.target.value.trim().toLowerCase();

			debouncedUpdate(query || '');
		},
		[debouncedUpdate],
	);

	const handleFilterByCategory = (category: string): void => {
		setSelectedDataSource(null);
		setSelectedFramework(null);
		setSelectedEnvironment(null);

		setSelectedCategory(category);

		if (category === 'All') {
			setGroupedDataSources(allGroupedDataSources);
			return;
		}

		if (allGroupedDataSources[category]) {
			setGroupedDataSources({
				[category]: allGroupedDataSources[category],
			});
		} else {
			// Fallback if somehow the category key doesn't strictly match or relies on partial match
			// This preserves the old behavior as a fallback, though sidebar clicks should be exact matches
			const filteredDataSources = onboardingConfigWithLinks.filter(
				(dataSource) =>
					dataSource.tags.includes(category) ||
					dataSource.tags.some((tag) => tag.toLowerCase().includes(category)),
			);
			setGroupedDataSources(
				groupDataSourcesByTags(filteredDataSources as Entity[]),
			);
		}
	};

	useEffect(() => {
		setSetupStepItems([
			{
				...setupStepItemsBase[0],
				description: org?.[0]?.displayName || '',
			},
			...setupStepItemsBase.slice(1),
		]);
	}, [org]);

	const handleUpdateCurrentStep = (
		step: number,
		event?: React.MouseEvent,
	): void => {
		setCurrentStep(step);

		if (step === 1) {
			setSetupStepItems([
				{
					...setupStepItemsBase[0],
					description: org?.[0]?.displayName || '',
				},
				{
					...setupStepItemsBase[1],
					description: '',
				},
				...setupStepItemsBase.slice(2),
			]);
		} else if (step === 2) {
			setSetupStepItems([
				{
					...setupStepItemsBase[0],
					description: org?.[0]?.displayName || '',
				},
				{
					...setupStepItemsBase[1],
					description: `${selectedDataSource?.label} ${
						selectedFramework?.label ? `- ${selectedFramework?.label}` : ''
					}`,
				},
				...setupStepItemsBase.slice(2),
			]);
		} else if (step === 3) {
			let targetPath: string;
			switch (selectedDataSource?.module) {
				case 'apm':
					targetPath = ROUTES.APPLICATION;
					break;
				case 'logs':
					targetPath = ROUTES.LOGS;
					break;
				case 'metrics':
					targetPath = ROUTES.METRICS_EXPLORER;
					break;
				case 'dashboards':
					targetPath = ROUTES.ALL_DASHBOARD;
					break;
				case 'infra-monitoring-hosts':
					targetPath = ROUTES.INFRASTRUCTURE_MONITORING_HOSTS;
					break;
				case 'infra-monitoring-k8s':
					targetPath = ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES;
					break;
				case 'messaging-queues-kafka':
					targetPath = ROUTES.MESSAGING_QUEUES_KAFKA;
					break;
				case 'messaging-queues-celery':
					targetPath = ROUTES.MESSAGING_QUEUES_CELERY_TASK;
					break;
				case 'integrations':
					targetPath = ROUTES.INTEGRATIONS;
					break;
				case 'home':
					targetPath = ROUTES.HOME;
					break;
				case 'api-monitoring':
					targetPath = ROUTES.API_MONITORING;
					break;
				default:
					targetPath = ROUTES.APPLICATION;
			}
			safeNavigate(targetPath, { newTab: !!event && isModifierKeyPressed(event) });
		}
	};

	const handleShowInviteTeamMembersModal = (): void => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INVITE_TEAM_MEMBER_BUTTON_CLICKED}`,
			{
				dataSource: selectedDataSource?.label,
				framework: selectedFramework?.label,
				environment: selectedEnvironment?.label,
				currentPage: setupStepItems[currentStep]?.title || '',
			},
		);
		setShowInviteTeamMembersModal(true);
	};

	const handleSubmitDataSourceRequest = (): void => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.DATA_SOURCE_REQUESTED}`,
			{
				requestedDataSource: dataSourceRequest,
			},
		);
		setShowRequestDataSourceModal(false);
		setDataSourceRequestSubmitted(true);
	};

	const handleRequestDataSource = (): void => {
		setShowRequestDataSourceModal(true);
	};

	const handleRaiseRequest = (): void => {
		void logEvent(
			`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.DATA_SOURCE_REQUESTED}`,
			{
				requestedDataSource: searchQuery,
			},
		);

		setDataSourceRequestSubmitted(true);
	};

	const progressText = `Get Started (${Math.min(
		currentStep + 1,
		setupStepItems.length,
	)}/${setupStepItems.length})`;

	const isNoResultsFound = Object.keys(groupedDataSources).length === 0;

	const categories = [
		{ name: 'All', count: onboardingConfigWithLinks.length },
		...Object.keys(allGroupedDataSources).map((tag) => ({
			name: tag,
			count: allGroupedDataSources[tag].length,
		})),
	];

	return (
		<div className="tw:flex tw:min-h-screen tw:shrink-0 tw:flex-col tw:bg-background tw:font-sans tw:text-foreground">
			<SetupFlowHeader
				progressText={progressText}
				steps={setupStepItems}
				currentStep={currentStep}
				onClose={(e): void => {
					void logEvent(
						`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.CLOSE_ONBOARDING_CLICKED}`,
						{
							currentPage: setupStepItems[currentStep]?.title || '',
						},
					);

					safeNavigate(ROUTES.HOME, { newTab: isModifierKeyPressed(e) });
				}}
				onInviteTeammate={handleShowInviteTeamMembersModal}
				chatSupport={{
					attributes: {
						dataSource: selectedDataSource?.dataSource,
						framework: selectedFramework?.label,
						environment: selectedEnvironment?.label,
						currentPage: setupStepItems[currentStep]?.title || '',
					},
					eventName: `${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.GET_HELP_BUTTON_CLICKED}`,
				}}
			/>

			{currentStep === 1 && (
				<div className="tw:mx-auto tw:flex tw:w-full tw:max-w-[1600px] tw:flex-col tw:gap-6 tw:px-4 tw:pt-6 tw:md:px-8">
					<PageHeader
						testId="onboarding-data-source-header"
						icon={<Cable />}
						title="Select your data source"
						description="Select from a host of services to start sending data to FuseScope"
					/>

					<div className="tw:flex tw:items-start tw:gap-8">
						<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-8">
							<div className="fs-ui tw:relative tw:font-sans">
								<SearchIcon
									aria-hidden
									className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-muted-foreground"
								/>
								<Input
									placeholder="Search"
									maxLength={20}
									onChange={handleSearch}
									className="tw:h-10 tw:border-border tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
								/>
							</div>

							{Object.keys(groupedDataSources).map((tag) => (
								<section
									key={tag}
									className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:font-sans"
								>
									<div className="tw:flex tw:items-center tw:gap-3">
										<h2 className="tw:text-xs tw:font-medium tw:tracking-wide tw:text-muted-foreground tw:uppercase">
											{tag} ({groupedDataSources[tag].length})
										</h2>
										<span aria-hidden className="tw:h-px tw:flex-1 tw:bg-border" />
									</div>
									<div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] tw:gap-2">
										{groupedDataSources[tag].map((dataSource) => (
											<DataSourceOption
												key={dataSource.dataSource}
												label={dataSource.label}
												imgUrl={dataSource.imgUrl}
												selected={selectedDataSource?.label === dataSource.label}
												onClick={(): void => handleSelectDataSource(dataSource)}
											/>
										))}
									</div>
								</section>
							))}

							{isNoResultsFound && (
								<p className="fs-ui tw:font-sans tw:text-xs tw:tracking-wide tw:text-muted-foreground tw:uppercase">
									No results for {searchQuery} :/
								</p>
							)}

							{!selectedDataSource && (
								<RequestDataSource
									searchQuery={searchQuery}
									hasResults={!isNoResultsFound}
									submitted={dataSourceRequestSubmitted}
									onRequest={handleRequestDataSource}
									onRaiseRequest={handleRaiseRequest}
								/>
							)}
						</div>

						<aside className="tw:sticky tw:top-[136px] tw:max-h-[calc(100vh-152px)] tw:w-60 tw:shrink-0 tw:overflow-y-auto">
							<CategoryFilters
								categories={categories}
								selectedCategory={selectedCategory}
								onSelect={handleFilterByCategory}
							/>
						</aside>
					</div>

					{selectedDataSource?.question?.desc &&
						!isEmpty(selectedDataSource?.question) && (
							<QuestionSection
								ref={question2Ref}
								step={2}
								answered={!!selectedFramework}
								title={selectedDataSource.question.desc}
								helpText={selectedDataSource.question.helpText}
								helpLink={selectedDataSource.question.helpLink}
								helpLinkText={selectedDataSource.question.helpLinkText}
							>
								{selectedDataSource.question.options.map((option) => (
									<DataSourceOption
										key={option.label}
										shape="pill"
										label={option.label}
										imgUrl={option.imgUrl}
										selected={selectedFramework?.label === option.label}
										onClick={(): void => {
											if (selectedDataSource?.question?.entityID === 'environment') {
												handleSelectEnvironment(option, option.link);
											} else {
												handleSelectFramework(option);
											}
										}}
									/>
								))}
							</QuestionSection>
						)}

					{selectedFramework?.question?.desc &&
						!isEmpty(selectedFramework?.question) && (
							<QuestionSection
								ref={question3Ref}
								step={3}
								answered={!!selectedEnvironment}
								title={selectedFramework.question.desc}
								helpText={selectedFramework.question.helpText}
								helpLink={selectedFramework.question.helpLink}
								helpLinkText={selectedFramework.question.helpLinkText}
							>
								{selectedFramework.question.options.map((option) => (
									<DataSourceOption
										key={option.label}
										shape="pill"
										label={option.label}
										imgUrl={option.imgUrl || fuseScopeBrandLogoUrl}
										selected={selectedEnvironment?.label === option.label}
										onClick={(): void => handleSelectEnvironment(option, option.link)}
									/>
								))}
							</QuestionSection>
						)}

					{!hasMoreQuestions && showConfigureProduct && (
						<div
							ref={configureProdRef}
							className="fs-ui tw:sticky tw:bottom-0 tw:z-10 tw:-mx-4 tw:border-t tw:border-border tw:bg-background tw:px-4 tw:py-3 tw:font-sans tw:md:-mx-8 tw:md:px-8"
						>
							<Button
								disabled={!selectedDataSource}
								onClick={(e): void => {
									void logEvent(
										`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.CONFIGURED_PRODUCT}`,
										{
											dataSource: selectedDataSource?.label,
											framework: selectedFramework?.label,
											environment: selectedEnvironment?.label,
										},
									);

									const currentEntity =
										selectedEnvironment || selectedFramework || selectedDataSource;

									if (currentEntity?.internalRedirect && currentEntity?.link) {
										safeNavigate(currentEntity.link, {
											newTab: isModifierKeyPressed(e),
										});
									} else {
										handleUpdateCurrentStep(2);
									}
								}}
							>
								Next: Configure your product
								<ArrowRight aria-hidden />
							</Button>
						</div>
					)}
				</div>
			)}

			{currentStep === 2 && (
				<div className="tw:flex tw:h-[calc(100vh-121px)] tw:gap-4 tw:px-4 tw:py-4 tw:md:px-8">
					<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-4">
						<div className="tw:relative tw:flex-1 tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised">
							<div
								aria-hidden
								className="tw:absolute tw:inset-0 tw:mx-auto tw:flex tw:w-1/2 tw:flex-col tw:justify-center tw:gap-3"
							>
								<Skeleton className="tw:size-10" />
								<Skeleton className="tw:h-5 tw:w-3/4" />
								<Skeleton className="tw:h-5 tw:w-full" />
								<Skeleton className="tw:h-5 tw:w-full" />
							</div>
							<iframe
								title="docs"
								src={docsUrl}
								className="tw:relative tw:z-[1] tw:size-full tw:border-0"
								referrerPolicy="unsafe-url"
								loading="lazy"
								allow="clipboard-write; encrypted-media; web-share"
								allowFullScreen
							/>
						</div>

						<div className="fs-ui tw:flex tw:gap-2 tw:font-sans">
							<Button
								variant="outline"
								className="tw:w-28 tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
								onClick={(): void => {
									void logEvent(
										`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BACK_BUTTON_CLICKED}`,
										{
											dataSource: selectedDataSource?.label,
											framework: selectedFramework?.label,
											environment: selectedEnvironment?.label,
											currentPage: setupStepItems[currentStep]?.title || '',
										},
									);

									handleUpdateCurrentStep(1);
								}}
							>
								Back
							</Button>
							<Button
								className="tw:w-28"
								onClick={(e): void => {
									void logEvent(
										`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.CONTINUE_BUTTON_CLICKED}`,
										{
											dataSource: selectedDataSource?.label,
											framework: selectedFramework?.label,
											environment: selectedEnvironment?.label,
											currentPage: setupStepItems[currentStep]?.title || '',
										},
									);

									handleFilterByCategory('All');
									handleUpdateCurrentStep(3, e);
								}}
							>
								Continue
							</Button>
						</div>
					</div>

					<aside className="tw:w-[30%] tw:max-w-[480px] tw:shrink-0 tw:overflow-y-auto">
						<OnboardingIngestionDetails />
					</aside>
				</div>
			)}

			<Modal
				className="invite-team-member-modal"
				title={<span className="title">Invite a team member</span>}
				open={showInviteTeamMembersModal}
				closable
				onCancel={(): void => setShowInviteTeamMembersModal(false)}
				width="640px"
				footer={null}
				destroyOnClose
			>
				<div className="invite-team-member-modal-content">
					<InviteMembers
						onSuccess={(): void => {
							void logEvent(
								`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INVITE_TEAM_MEMBER_SUCCESS}`,
								{},
							);
							setShowInviteTeamMembersModal(false);

							toast.success('Invites sent successfully', { position: 'top-center' });
						}}
						onPartialSuccess={(): void => {
							void logEvent(
								`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INVITE_TEAM_MEMBER_PARTIAL_SUCCESS}`,
								{},
							);
						}}
						onAllFailed={(): void => {
							void logEvent(
								`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INVITE_TEAM_MEMBER_FAILED}`,
								{},
							);
						}}
						renderFooter={({ submit, canSubmit, isSubmitting }): JSX.Element => (
							<div className="invite-team-member-modal-footer">
								<SignozButton
									size="md"
									variant="solid"
									color="secondary"
									onClick={(): void => setShowInviteTeamMembersModal(false)}
								>
									Cancel
								</SignozButton>
								<SignozButton
									size="md"
									color="primary"
									variant="solid"
									onClick={(): void => {
										void logEvent(
											`${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.BASE}: ${ONBOARDING_V3_ANALYTICS_EVENTS_MAP?.INVITE_TEAM_MEMBER_SEND_CLICKED}`,
											{},
										);
										void submit();
									}}
									disabled={!canSubmit}
									disabledTooltip="Add at least one team member to invite"
									loading={isSubmitting}
									suffix={<ArrowRight size={14} />}
								>
									Send Invites
								</SignozButton>
							</div>
						)}
					/>
				</div>
			</Modal>

			<Modal
				className="request-data-source-modal"
				title={<span className="title">Request Data Source</span>}
				open={showRequestDataSourceModal}
				closable
				onCancel={(): void => setShowRequestDataSourceModal(false)}
				width="640px"
				footer={
					<div className="fs-ui tw:flex tw:justify-end tw:gap-2 tw:font-sans">
						<Button
							variant="outline"
							className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
							onClick={(): void => setShowRequestDataSourceModal(false)}
						>
							<X aria-hidden />
							Cancel
						</Button>
						<Button
							disabled={dataSourceRequest.length <= 0}
							onClick={handleSubmitDataSourceRequest}
						>
							<Check aria-hidden />
							Submit request
						</Button>
					</div>
				}
				destroyOnClose
			>
				<div className="fs-ui tw:flex tw:flex-col tw:gap-2 tw:py-3 tw:font-sans">
					<label
						htmlFor="request-data-source-input"
						className="tw:text-sm tw:text-foreground"
					>
						Enter your request
					</label>
					<Input
						id="request-data-source-input"
						placeholder="Eg: Kotlin"
						onChange={(e): void => setDataSourceRequest(e.target.value)}
					/>
				</div>
			</Modal>
		</div>
	);
}

export default OnboardingAddDataSource;
