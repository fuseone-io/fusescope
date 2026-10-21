import NumberedTablePagination from 'components/PageTemplate/components/NumberedTablePagination';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';

import ExceptionsTable from './ExceptionsTable';
import { useAllErrorsParams } from './useAllErrorsParams';
import { useAllErrorsQueries } from './useAllErrorsQueries';

function AllErrors(): JSX.Element {
	const params = useAllErrorsParams();
	const { rows, total, isLoading, isCancelled } = useAllErrorsQueries(params);

	if (isCancelled && rows.length === 0) {
		return (
			<ContentPanel testId="exceptions-table" title="All exceptions" divided>
				<p
					data-testid="exceptions-query-cancelled"
					className="fs-ui tw:m-0 tw:px-5 tw:py-12 tw:text-center tw:font-sans tw:text-[13px] tw:text-muted-foreground"
				>
					<span className="tw:font-medium tw:text-foreground">Query cancelled.</span>{' '}
					Click &ldquo;Run Query&rdquo; to load exceptions.
				</p>
			</ContentPanel>
		);
	}

	return (
		<ContentPanel
			testId="exceptions-table"
			title="All exceptions"
			actions={
				<span className="tw:text-xs tw:text-subtle-foreground">
					Grouped by type, message and service
				</span>
			}
			divided
		>
			<ExceptionsTable rows={rows} loading={isLoading} params={params} />
			<NumberedTablePagination
				page={Math.floor(params.offset / params.pageSize) + 1}
				pageSize={params.pageSize}
				total={total}
				itemLabel="exceptions"
				onChange={params.onPageChange}
			/>
		</ContentPanel>
	);
}

export default AllErrors;
