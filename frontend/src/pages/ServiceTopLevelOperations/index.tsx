import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import TablePagination from 'components/PageTemplate/components/TablePagination';
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
		<HeaderBandLayout
			testId="top-level-operations-page"
			header={
				<CompactPageHeader
					icon={<HardDrive />}
					titleMono
					title={servicename}
					meta={
						<>
							Top level operations
							{!isLoading && (
								<>
									{' · '}
									<strong
										data-testid="top-level-operations-count"
										className="tw:font-medium tw:text-foreground"
									>
										{topLevelOperations.length}
									</strong>
								</>
							)}
						</>
					}
				/>
			}
			bodyClassName="tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6"
		>
			<TopLevelOperationsInfo />

			{isLoading && (
				<div className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans tw:text-sm tw:text-muted-foreground">
					<LoaderCircle className="tw:size-4 tw:animate-spin" /> Loading ...
				</div>
			)}

			{!isLoading && (
				<ContentPanel
					title="Top Level Operations"
					testId="top-level-operations-list"
					divided
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
				</ContentPanel>
			)}
		</HeaderBandLayout>
	);
}
