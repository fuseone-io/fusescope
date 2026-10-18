import React, { ChangeEvent, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Form } from 'antd';
import {
	useDeleteDowntimeScheduleByID,
	useListDowntimeSchedules,
} from 'api/generated/services/downtimeschedules';
import { useListRules } from 'api/generated/services/rules';
import ConfigSectionHeader from 'components/Alerts/ConfigSectionHeader/ConfigSectionHeader';
import type { AlertmanagertypesPlannedMaintenanceDTO } from 'api/generated/services/fuseScope.schemas';
import dayjs from 'dayjs';
import useDebouncedFn from 'hooks/useDebouncedFunction';
import { useNotifications } from 'hooks/useNotifications';
import useUrlQuery from 'hooks/useUrlQuery';
import { useAppContext } from 'providers/App/App';
import { useErrorModal } from 'providers/ErrorModalProvider';
import { USER_ROLES } from 'types/roles';

import 'dayjs/locale/en';

import { PlannedDowntimeDeleteModal } from './PlannedDowntimeDeleteModal';
import { PlannedDowntimeForm } from './PlannedDowntimeForm';
import { PlannedDowntimeList } from './PlannedDowntimeList';
import {
	defaultInitialValues,
	deleteDowntimeHandler,
} from './PlannedDowntimeutils';

import './PlannedDowntime.styles.scss';

dayjs.locale('en');

export function PlannedDowntime(): JSX.Element {
	const {
		data: alertsData,
		isError,
		isLoading,
	} = useListRules({
		query: { cacheTime: 0 },
	});
	const [isOpen, setIsOpen] = React.useState(false);
	const [form] = Form.useForm();
	const { user } = useAppContext();
	const { showErrorModal } = useErrorModal();
	const history = useHistory();
	const urlQuery = useUrlQuery();

	const [initialValues, setInitialValues] =
		useState<Partial<AlertmanagertypesPlannedMaintenanceDTO>>(
			defaultInitialValues,
		);

	const downtimeSchedules = useListDowntimeSchedules();
	const alertOptions = React.useMemo(
		() =>
			alertsData?.data?.map((i) => ({
				label: i.alert,
				value: i.id,
			})),
		[alertsData],
	);

	useEffect(() => {
		if (!isOpen) {
			form.resetFields();
		}
	}, [form, isOpen]);

	const [searchValue, setSearchValue] = React.useState<string | number>(
		urlQuery.get('search') || '',
	);
	const [deleteData, setDeleteData] = useState<{ id: string; name: string }>();
	const [isEditMode, setEditMode] = useState<boolean>(false);

	const updateUrlWithSearch = useDebouncedFn((value) => {
		const searchValue = value as string;
		if (searchValue) {
			urlQuery.set('search', searchValue);
		} else {
			urlQuery.delete('search');
		}
		const url = `/alerts?${urlQuery.toString()}`;
		history.replace(url);
	}, 300);

	const handleSearch = (e: ChangeEvent<HTMLInputElement>): void => {
		setSearchValue(e.target.value);
		updateUrlWithSearch(e.target.value);
	};

	const clearSearch = (): void => {
		setSearchValue('');
		updateUrlWithSearch('');
	};

	// Delete Downtime Schedule
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const { notifications } = useNotifications();

	const hideDeleteDowntimeScheduleModal = (): void => {
		setIsDeleteModalOpen(false);
	};

	const refetchAllSchedules = (): void => {
		downtimeSchedules.refetch();
	};

	const {
		mutateAsync: deleteDowntimeScheduleAsync,
		isLoading: isDeleteLoading,
	} = useDeleteDowntimeScheduleByID();

	const onDeleteHandler = (): void => {
		deleteDowntimeHandler({
			deleteDowntimeScheduleAsync,
			notifications,
			showErrorModal,
			refetchAllSchedules,
			deleteId: deleteData?.id,
			hideDeleteDowntimeScheduleModal,
			clearSearch,
		});
	};

	return (
		<div className="planned-downtime-container">
			<div className="planned-downtime-content">
				<ConfigSectionHeader
					title="Planned Downtime"
					subtitle="Create and manage planned downtimes."
					searchPlaceholder="Search for a planned downtime..."
					searchValue={String(searchValue)}
					onSearch={handleSearch}
					actionLabel="New downtime"
					onAction={(): void => {
						setInitialValues(defaultInitialValues);
						setIsOpen(true);
						setEditMode(false);
						form.resetFields();
					}}
					actionDisabled={user?.role === USER_ROLES.VIEWER}
					actionTooltip={
						user?.role === USER_ROLES.VIEWER
							? 'You need edit permissions to create a planned downtime'
							: ''
					}
				/>
				<PlannedDowntimeList
					downtimeSchedules={downtimeSchedules}
					alertOptions={alertOptions || []}
					setInitialValues={setInitialValues}
					setModalOpen={setIsOpen}
					handleDeleteDowntime={(id, name): void => {
						setDeleteData({ id, name });
						setIsDeleteModalOpen(true);
					}}
					setEditMode={setEditMode}
					searchValue={searchValue}
				/>
				{isOpen && (
					<PlannedDowntimeForm
						alertOptions={alertOptions || []}
						initialValues={initialValues}
						isError={isError}
						isLoading={isLoading}
						isOpen={isOpen}
						setIsOpen={setIsOpen}
						refetchAllSchedules={refetchAllSchedules}
						isEditMode={isEditMode}
						form={form}
					/>
				)}
				<PlannedDowntimeDeleteModal
					isDeleteLoading={isDeleteLoading}
					isDeleteModalOpen={isDeleteModalOpen}
					onDeleteHandler={onDeleteHandler}
					setIsDeleteModalOpen={setIsDeleteModalOpen}
					downtimeSchedule={deleteData?.name || ''}
				/>
			</div>
		</div>
	);
}
