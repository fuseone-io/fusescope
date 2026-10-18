import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { useListSavedViews } from 'api/generated/services/saved-view';
import {
	SavedviewtypesSavedViewDTO,
	SavedviewtypesSourceDTO,
} from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import { getSavedViewQuery } from 'container/SavedViews/utils/getSavedViewQuery';
import { useHandleExplorerTabChange } from 'hooks/useHandleExplorerTabChange';
import { SOURCEPAGE_VS_ROUTES } from 'pages/SaveView/constants';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import { ArrowRight, Bookmark, Compass } from 'lucide-react';

import HomeEmptyState from '../components/HomeEmptyState';
import HomeListItem from '../components/HomeListItem';
import HomeWidget from '../components/HomeWidget';
import WidgetLink from '../components/WidgetLink';
import SavedViewsTabs from './SavedViewsTabs';

export default function SavedViews({
	onUpdateChecklistDoneItem,
	loadingUserPreferences,
}: {
	onUpdateChecklistDoneItem: (itemKey: string) => void;
	loadingUserPreferences: boolean;
}): JSX.Element {
	const { user } = useAppContext();
	const isSavedViewEnabled = useSavedViewEnabled();
	const [selectedEntity, setSelectedEntity] = useState<string>('logs');
	const [selectedEntityViews, setSelectedEntityViews] = useState<
		SavedviewtypesSavedViewDTO[]
	>([]);

	const {
		data: logsViewsData,
		isLoading: logsViewsLoading,
		isError: logsViewsError,
	} = useListSavedViews({ source: SavedviewtypesSourceDTO.logs });

	const {
		data: tracesViewsData,
		isLoading: tracesViewsLoading,
		isError: tracesViewsError,
	} = useListSavedViews({ source: SavedviewtypesSourceDTO.traces });

	const {
		data: metricsViewsData,
		isLoading: metricsViewsLoading,
		isError: metricsViewsError,
	} = useListSavedViews({ source: SavedviewtypesSourceDTO.metrics });

	const logsViews = useMemo(
		() => [...(logsViewsData?.data || [])],
		[logsViewsData],
	);

	const tracesViews = useMemo(
		() => [...(tracesViewsData?.data || [])],
		[tracesViewsData],
	);

	const metricsViews = useMemo(
		() => [...(metricsViewsData?.data || [])],
		[metricsViewsData],
	);

	useEffect(() => {
		if (selectedEntity === 'logs') {
			setSelectedEntityViews(logsViews);
		} else if (selectedEntity === 'traces') {
			setSelectedEntityViews(tracesViews);
		} else if (selectedEntity === 'metrics') {
			setSelectedEntityViews(metricsViews);
		}
	}, [selectedEntity, logsViews, tracesViews, metricsViews]);

	const hasTracesViews = tracesViews.length > 0;
	const hasLogsViews = logsViews.length > 0;
	const hasMetricsViews = metricsViews.length > 0;

	const hasSavedViews = hasTracesViews || hasLogsViews || hasMetricsViews;

	const { handleExplorerTabChange } = useHandleExplorerTabChange();

	const handleRedirectQuery = (view: SavedviewtypesSavedViewDTO): void => {
		void logEvent('Homepage: Saved view clicked', {
			viewId: view.id,
			viewName: view.spec.displayName,
			entity: selectedEntity,
		});

		handleExplorerTabChange(
			view.spec.panelType,
			{
				query: getSavedViewQuery(view),
				viewName: view.spec.displayName,
				viewKey: view.id,
			},
			SOURCEPAGE_VS_ROUTES[selectedEntity],
		);
	};

	useEffect(() => {
		if (hasSavedViews && !loadingUserPreferences) {
			onUpdateChecklistDoneItem('SETUP_SAVED_VIEWS');
		}
	}, [hasSavedViews, onUpdateChecklistDoneItem, loadingUserPreferences]);

	const footerLink = useMemo(() => {
		if (selectedEntity === 'logs') {
			return ROUTES.LOGS_SAVE_VIEWS;
		}
		if (selectedEntity === 'traces') {
			return ROUTES.TRACES_SAVE_VIEWS;
		}
		if (selectedEntity === 'metrics') {
			return ROUTES.METRICS_EXPLORER_VIEWS;
		}
		return '';
	}, [selectedEntity]);

	const getStartedLink = useMemo(() => {
		if (selectedEntity === 'logs') {
			return ROUTES.LOGS_EXPLORER;
		}
		if (selectedEntity === 'traces') {
			return ROUTES.TRACES_EXPLORER;
		}
		if (selectedEntity === 'metrics') {
			return ROUTES.METRICS_EXPLORER_EXPLORER;
		}
		return '';
	}, [selectedEntity]);

	const handleTabChange = (tab: string): void => {
		void logEvent('Homepage: Saved views switched', {
			tab,
		});
		let currentViews: SavedviewtypesSavedViewDTO[] = [];
		if (tab === 'logs') {
			currentViews = logsViews;
		} else if (tab === 'traces') {
			currentViews = tracesViews;
		} else if (tab === 'metrics') {
			currentViews = metricsViews;
		}
		setSelectedEntityViews(currentViews);
		setSelectedEntity(tab);
	};

	const isViewer = user?.role === USER_ROLES.VIEWER;

	const emptyState = (
		<HomeEmptyState
			icon={<Bookmark />}
			title="You have not saved any views yet."
			description={
				isViewer ? undefined : 'Explore your data and save them as views.'
			}
			action={
				isViewer ? undefined : (
					<Button asChild variant="outline" size="sm">
						<Link
							to={getStartedLink}
							onClick={(): void => {
								void logEvent('Homepage: Get Started clicked', {
									source: 'Saved Views',
									entity: selectedEntity,
								});
							}}
							className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
						>
							Get Started
							<ArrowRight aria-hidden="true" />
						</Link>
					</Button>
				)
			}
			onLearnMore={
				isViewer
					? undefined
					: (): void => {
							void logEvent('Homepage: Learn more clicked', {
								source: 'Saved Views',
								entity: selectedEntity,
							});

							window.open(
								fuseScopeDocsUrl('/explore/metrics/#chart-a-metric'),
								'_blank',
								'noopener noreferrer',
							);
						}
			}
		/>
	);

	const savedViewsList = (
		<ul className="fs-ui tw:font-sans">
			{selectedEntityViews.slice(0, 5).map((view) => (
				<HomeListItem
					key={view.id}
					icon={<Bookmark />}
					label={view.spec.displayName}
					onOpen={(): void => handleRedirectQuery(view)}
					trailing={
						<Compass aria-hidden="true" className="tw:size-4 tw:text-primary" />
					}
				/>
			))}
		</ul>
	);

	return (
		<HomeWidget
			title="Saved Views"
			testId="home-saved-views"
			pending={
				logsViewsLoading ||
				tracesViewsLoading ||
				metricsViewsLoading ||
				logsViewsError ||
				tracesViewsError ||
				metricsViewsError
			}
			actions={
				hasSavedViews && (
					<>
						<SavedViewsTabs value={selectedEntity} onChange={handleTabChange} />
						{!isSavedViewEnabled && selectedEntityViews.length > 0 && (
							<WidgetLink
								to={footerLink}
								label="All Views"
								onClick={(): void => {
									void logEvent('Homepage: All saved views clicked', {
										entity: selectedEntity,
									});
								}}
							/>
						)}
					</>
				)
			}
		>
			{selectedEntityViews.length > 0 ? savedViewsList : emptyState}
		</HomeWidget>
	);
}
