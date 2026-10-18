import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { pageOf } from 'components/PageTemplate/utils';
import { Table, TableBody, TableCell, TableRow } from 'components/ui/table';
import { IServiceName } from 'container/MetricsApplication/Tabs/types';
import useErrorNotification from 'hooks/useErrorNotification';
import { useQueryService } from 'hooks/useQueryService';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { Tags } from 'hooks/useResourceAttribute/types';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { HardDrive, LoaderCircle } from 'lucide-react';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import TopLevelOperationsInfo from './TopLevelOperationsInfo';

const PAGE_SIZE = 100;

export default function ServiceTopLevelOperations(): JSX.Element {
	const { servicename: encodedServiceName } = useParams<IServiceName>();
	const { maxTime, minTime, selectedTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);
	const servicename = decodeURIComponent(encodedServiceName);
	const { queries } = useResourceAttribute();
	const selectedTags = useMemo(
		() => (convertRawQueriesToTraceSelectedTags(queries) as Tags[]) || [],
		[queries],
	);

	const [topLevelOperations, setTopLevelOperations] = useState<string[]>([]);
	const [page, setPage] = useState(1);

	const { data, error, isLoading } = useQueryService({
		minTime,
		maxTime,
		selectedTime,
		selectedTags,
	});

	useErrorNotification(error);

	useEffect(() => {
		const selectedService = data?.find(
			(service) => service.serviceName === servicename,
		);

		setTopLevelOperations(selectedService?.dataWarning?.topLevelOps || []);
	}, [servicename, data]);

	const rows = pageOf(topLevelOperations, page, PAGE_SIZE);

	return (
		<PageTemplate testId="top-level-operations-page">
			<PageHeader
				icon={<HardDrive />}
				titleMono
				title={servicename}
				badges={
					!isLoading && (
						<StatusBadge tone="neutral" testId="top-level-operations-count">
							{topLevelOperations.length}
						</StatusBadge>
					)
				}
				description="Top level operations"
			/>

			<TopLevelOperationsInfo />

			{isLoading && (
				<div className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans tw:text-sm tw:text-muted-foreground">
					<LoaderCircle className="tw:size-4 tw:animate-spin" /> Loading ...
				</div>
			)}

			{!isLoading && (
				<Panel
					title="Top Level Operations"
					testId="top-level-operations-list"
					className="tw:overflow-hidden"
					bodyClassName="tw:mt-3 tw:border-t tw:border-border"
				>
					<Table>
						<TableBody>
							{rows.map((operation) => (
								<TableRow key={operation} data-testid="top-level-operation">
									<TableCell className="tw:font-mono tw:text-xs tw:whitespace-normal tw:break-all">
										{operation}
									</TableCell>
								</TableRow>
							))}
							{rows.length === 0 && (
								<TableRow>
									<TableCell className="tw:h-24 tw:text-center tw:text-muted-foreground">
										No data
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
					<TablePagination
						page={page}
						pageSize={PAGE_SIZE}
						total={topLevelOperations.length}
						onPageChange={setPage}
					/>
				</Panel>
			)}
		</PageTemplate>
	);
}
