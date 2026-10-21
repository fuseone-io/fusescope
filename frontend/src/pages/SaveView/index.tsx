import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Color } from '@signozhq/design-tokens';
import logEvent from 'api/common/logEvent';
import {
	getViewDetailsUsingViewKey,
	showErrorNotification,
} from 'components/ExplorerCard/utils';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { Input } from 'components/ui/input';
import { fuseScopeDocsUrl } from 'constants/docs';
import { describeMeterQuery } from 'container/MeterExplorer/describeMeterQuery';
import {
	MeterExplorerEventKeys,
	MeterExplorerEvents,
} from 'container/MeterExplorer/events';
import {
	MetricsExplorerEventKeys,
	MetricsExplorerEvents,
} from 'container/MetricsExplorer/events';
import { useDeleteView } from 'hooks/saveViews/useDeleteView';
import { useGetAllViews } from 'hooks/saveViews/useGetAllViews';
import { useUpdateView } from 'hooks/saveViews/useUpdateView';
import useErrorNotification from 'hooks/useErrorNotification';
import { useHandleExplorerTabChange } from 'hooks/useHandleExplorerTabChange';
import { useNotifications } from 'hooks/useNotifications';
import { Search } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { ICompositeMetricQuery } from 'types/api/alerts/compositeQuery';
import { ViewProps } from 'types/api/saveViews/types';
import { DataSource } from 'types/common/queryBuilder';
import { USER_ROLES } from 'types/roles';

import DeleteViewDialog from './components/DeleteViewDialog';
import EditViewDialog from './components/EditViewDialog';
import ViewsTable from './components/ViewsTable';
import { ROUTES_VS_SOURCEPAGE, SOURCEPAGE_VS_ROUTES } from './constants';
import { deleteViewHandler } from './utils';

const allowedRoles = [USER_ROLES.ADMIN, USER_ROLES.AUTHOR, USER_ROLES.EDITOR];

function SaveView(): JSX.Element {
	const { pathname } = useLocation();
	const sourcepage = ROUTES_VS_SOURCEPAGE[pathname];
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [activeViewKey, setActiveViewKey] = useState<string>('');
	const [newViewName, setNewViewName] = useState<string>('');
	const [color, setColor] = useState(Color.BG_SIENNA_500);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [activeViewName, setActiveViewName] = useState<string>('');
	const [activeCompositeQuery, setActiveCompositeQuery] =
		useState<ICompositeMetricQuery | null>(null);
	const [searchValue, setSearchValue] = useState<string>('');
	const [dataSource, setDataSource] = useState<ViewProps[]>([]);
	const { t } = useTranslation(['explorer']);

	const hideDeleteViewModal = (): void => {
		setIsDeleteModalOpen(false);
	};

	const { user } = useAppContext();

	const handleDeleteModelOpen = (uuid: string, name: string): void => {
		setActiveViewKey(uuid);
		setActiveViewName(name);
		setIsDeleteModalOpen(true);
	};

	const hideEditViewModal = (): void => {
		setIsEditModalOpen(false);
	};

	const handleEditModelOpen = (view: ViewProps, color: string): void => {
		setActiveViewKey(view.id);
		setColor(color);
		setActiveViewName(view.name);
		setNewViewName(view.name);
		setActiveCompositeQuery(view.compositeQuery);
		setIsEditModalOpen(true);
	};

	const { notifications } = useNotifications();

	const {
		data: viewsData,
		isLoading,
		error,
		isRefetching,
		refetch: refetchAllView,
	} = useGetAllViews(sourcepage as DataSource);

	useEffect(() => {
		setDataSource(viewsData?.data.data || []);
	}, [viewsData?.data.data]);

	useErrorNotification(error);

	const handleSearch = (e: ChangeEvent<HTMLInputElement>): void => {
		setSearchValue(e.target.value);
		const filteredData = viewsData?.data.data.filter((view) =>
			view.name.toLowerCase().includes(e.target.value.toLowerCase()),
		);
		setDataSource(filteredData || []);
	};

	const clearSearch = (): void => {
		setSearchValue('');
	};

	const { mutateAsync: deleteViewAsync, isLoading: isDeleteLoading } =
		useDeleteView(activeViewKey);

	const onDeleteHandler = (): void => {
		deleteViewHandler({
			deleteViewAsync,
			notifications,
			refetchAllView,
			viewId: activeViewKey,
			hideDeleteViewModal,
			clearSearch,
		});
	};

	const { mutateAsync: updateViewAsync, isLoading: isViewUpdating } =
		useUpdateView({
			compositeQuery: activeCompositeQuery || ({} as ICompositeMetricQuery),
			viewKey: activeViewKey,
			extraData: JSON.stringify({ color }),
			sourcePage: sourcepage || DataSource.LOGS,
			viewName: newViewName,
		});

	const logEventCalledRef = useRef(false);
	useEffect(() => {
		if (!logEventCalledRef.current && !isLoading) {
			if (sourcepage === DataSource.TRACES) {
				logEvent('Traces Views: Views visited', {
					number: viewsData?.data?.data?.length,
				});
			} else if (sourcepage === DataSource.LOGS) {
				logEvent('Logs Views: Views visited', {
					number: viewsData?.data?.data?.length,
				});
			} else if (sourcepage === DataSource.METRICS) {
				logEvent(MetricsExplorerEvents.TabChanged, {
					[MetricsExplorerEventKeys.Tab]: 'views',
				});
			} else if (sourcepage === 'meter') {
				logEvent(MeterExplorerEvents.TabChanged, {
					[MeterExplorerEventKeys.Tab]: 'views',
				});
			}
			logEventCalledRef.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewsData?.data.data, isLoading]);
	const onUpdateQueryHandler = (): void => {
		updateViewAsync(
			{
				compositeQuery: activeCompositeQuery || ({} as ICompositeMetricQuery),
				viewKey: activeViewKey,
				extraData: JSON.stringify({ color }),
				sourcePage: sourcepage,
				viewName: activeViewName,
			},
			{
				onSuccess: () => {
					notifications.success({
						message: 'View Updated Successfully',
					});
					hideEditViewModal();
					refetchAllView();
					logEvent(MetricsExplorerEvents.ViewEdited, {
						[MetricsExplorerEventKeys.Tab]: 'views',
					});
				},
				onError: (err) => {
					showErrorNotification(notifications, err);
				},
			},
		);
	};

	const { handleExplorerTabChange } = useHandleExplorerTabChange();

	const handleRedirectQuery = (view: ViewProps): void => {
		const currentViewDetails = getViewDetailsUsingViewKey(
			view.id,
			viewsData?.data.data,
		);
		if (!currentViewDetails) {
			return;
		}
		const { query, name, id, panelType: currentPanelType } = currentViewDetails;

		if (sourcepage) {
			handleExplorerTabChange(
				currentPanelType,
				{
					query,
					viewName: name,
					viewKey: id,
				},
				SOURCEPAGE_VS_ROUTES[sourcepage],
			);
			logEvent(MetricsExplorerEvents.OpenInExplorerClicked, {
				[MetricsExplorerEventKeys.Tab]: 'views',
				[MetricsExplorerEventKeys.ViewName]: name,
			});
		}
	};

	const isEditDeleteSupported = allowedRoles.includes(user.role as string);

	return (
		<PageTemplate
			testId="saved-views-page"
			className="tw:mx-0 tw:max-w-[1120px] tw:gap-4 tw:md:p-6"
		>
			<div className="fs-ui tw:flex tw:flex-col tw:gap-0.5 tw:font-sans">
				<h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-foreground">
					Views
				</h2>
				<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
					Manage your saved views for {ROUTES_VS_SOURCEPAGE[pathname]}.{' '}
					<a
						href={fuseScopeDocsUrl('/explore/metrics/#chart-a-metric')}
						target="_blank"
						rel="noreferrer"
						className="tw:text-primary! tw:hover:text-primary-strong! tw:hover:underline"
					>
						Learn more
					</a>
				</p>
			</div>
			<div className="fs-ui tw:relative tw:w-full tw:max-w-[480px] tw:font-sans">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-2.5 tw:size-3.5 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					aria-label="Search for views"
					placeholder="Search for views..."
					value={searchValue}
					onChange={handleSearch}
					className="tw:h-8 tw:border-input tw:bg-surface-raised tw:pl-8 tw:text-[13px] tw:dark:bg-surface-raised"
				/>
			</div>

			<ViewsTable
				views={dataSource}
				loading={isLoading || isRefetching}
				canEdit={isEditDeleteSupported}
				onEdit={handleEditModelOpen}
				onOpen={handleRedirectQuery}
				onDelete={(view): void => handleDeleteModelOpen(view.id, view.name)}
				describeQuery={
					sourcepage === 'meter'
						? (view): string => describeMeterQuery(view.compositeQuery)
						: undefined
				}
			/>

			<DeleteViewDialog
				open={isDeleteModalOpen}
				message={t('delete_confirm_message', {
					viewName: activeViewName,
				})}
				loading={isDeleteLoading}
				onCancel={hideDeleteViewModal}
				onConfirm={onDeleteHandler}
			/>

			<EditViewDialog
				open={isEditModalOpen}
				name={newViewName}
				color={color}
				saving={isViewUpdating}
				onNameChange={setNewViewName}
				onColorChange={setColor}
				onCancel={hideEditViewModal}
				onSave={onUpdateQueryHandler}
			/>
		</PageTemplate>
	);
}

export default SaveView;
