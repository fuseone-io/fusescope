import React, { useEffect, useState } from 'react';
import { UseQueryResult } from 'react-query';
import type { DefaultOptionType } from 'antd/es/select';
import type {
	AlertmanagertypesPlannedMaintenanceDTO,
	ListDowntimeSchedules200,
	RenderErrorResponseDTO,
} from 'api/generated/services/fuseScope.schemas';
import type { ErrorType } from 'api/generatedAPIInstance';
import ConfigListSkeleton from 'components/Alerts/ConfigSectionHeader/ConfigListSkeleton';
import ConfigListState from 'components/Alerts/ConfigSectionHeader/ConfigListState';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import dayjs from 'dayjs';
import { useNotifications } from 'hooks/useNotifications';
import { CalendarClock, Plus, Search } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';
import { showErrorNotification } from 'utils/error';

import { DOWNTIME_PAGE_SIZE } from './constants';
import { DowntimeRow } from './DowntimeRow';
import { getAlertOptionsFromIds } from './PlannedDowntimeutils';
import { DowntimeSchedulesTableData } from './types';

export type { DowntimeSchedulesTableData } from './types';

const COLUMNS = [
	'Downtime',
	'Status',
	'Timeframe',
	'Repeats',
	'Duration',
	'Silenced alerts',
];

export function PlannedDowntimeList({
	downtimeSchedules,
	alertOptions,
	setInitialValues,
	setModalOpen,
	handleDeleteDowntime,
	setEditMode,
	searchValue,
	onCreate,
}: {
	downtimeSchedules: UseQueryResult<
		ListDowntimeSchedules200,
		ErrorType<RenderErrorResponseDTO>
	>;
	alertOptions: DefaultOptionType[];
	setInitialValues: React.Dispatch<
		React.SetStateAction<Partial<AlertmanagertypesPlannedMaintenanceDTO>>
	>;
	setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	handleDeleteDowntime: (id: string, name: string) => void;
	setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
	searchValue: string | number;
	onCreate?: () => void;
}): JSX.Element {
	const { notifications } = useNotifications();
	const { user } = useAppContext();
	const isCrudEnabled = user?.role !== USER_ROLES.VIEWER;
	const [page, setPage] = useState(1);
	const columnCount = COLUMNS.length + 1;

	const tableData: DowntimeSchedulesTableData[] = [
		...(downtimeSchedules.data?.data || []),
	]
		.sort((a, b): number => {
			if (a?.updatedAt && b?.updatedAt) {
				return dayjs(b.updatedAt).diff(dayjs(a.updatedAt));
			}
			return 0;
		})
		.filter(
			(data) =>
				data.name.includes(searchValue.toLocaleString()) ||
				data.id === searchValue.toLocaleString(),
		)
		.map((data) => {
			const specificAlertOptions = getAlertOptionsFromIds(
				data.alertIds || [],
				alertOptions,
			);

			return { ...data, alertOptions: specificAlertOptions };
		});

	useEffect(() => {
		if (downtimeSchedules.isError) {
			showErrorNotification(notifications, downtimeSchedules.error);
		}
	}, [downtimeSchedules.error, downtimeSchedules.isError, notifications]);

	const pageCount = Math.max(
		1,
		Math.ceil(tableData.length / DOWNTIME_PAGE_SIZE),
	);
	const currentPage = Math.min(page, pageCount);
	const pageRows = tableData.slice(
		(currentPage - 1) * DOWNTIME_PAGE_SIZE,
		currentPage * DOWNTIME_PAGE_SIZE,
	);
	const isLoading = downtimeSchedules.isLoading || downtimeSchedules.isFetching;
	const hasSearch = searchValue.toLocaleString().length > 0;

	const renderEmpty = (): JSX.Element =>
		hasSearch ? (
			<ConfigListState
				colSpan={columnCount}
				icon={<Search />}
				title="No matching planned downtime found."
				description="Try a different name or schedule ID."
				testId="planned-downtime-empty"
			/>
		) : (
			<ConfigListState
				colSpan={columnCount}
				icon={<CalendarClock />}
				title="No planned downtime yet"
				description="Schedule a window to silence alerts during maintenance or deploys."
				testId="planned-downtime-empty"
				action={
					isCrudEnabled && onCreate ? (
						<Button variant="outline" size="sm" onClick={onCreate}>
							<Plus aria-hidden="true" />
							New downtime
						</Button>
					) : undefined
				}
			/>
		);

	return (
		<ContentPanel
			testId="planned-downtime-panel"
			footer={
				tableData.length > DOWNTIME_PAGE_SIZE || !tableData.length ? undefined : (
					<span className="tw:tabular-nums">
						{`${tableData.length} ${tableData.length === 1 ? 'schedule' : 'schedules'}`}
					</span>
				)
			}
		>
			<Table aria-busy={isLoading}>
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						{COLUMNS.map((column) => (
							<TableHead key={column}>{column}</TableHead>
						))}
						<TableHead>
							<span className="tw:sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody
					className={isLoading && tableData.length ? 'tw:opacity-60' : undefined}
				>
					{isLoading && !tableData.length && (
						<ConfigListSkeleton colSpan={columnCount} />
					)}
					{!isLoading && !tableData.length && renderEmpty()}
					{pageRows.map((downtime) => (
						<DowntimeRow
							key={downtime.id}
							downtime={downtime}
							columnCount={columnCount}
							onEdit={
								isCrudEnabled
									? (): void => {
											setInitialValues({ ...downtime });
											setModalOpen(true);
											setEditMode(true);
										}
									: undefined
							}
							onDelete={
								isCrudEnabled
									? (): void =>
											handleDeleteDowntime(downtime.id ?? '', downtime.name || '')
									: undefined
							}
						/>
					))}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={DOWNTIME_PAGE_SIZE}
				total={tableData.length}
				onPageChange={setPage}
			/>
		</ContentPanel>
	);
}
