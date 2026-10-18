import { useTranslation } from 'react-i18next';
import NumberedTablePagination from 'components/PageTemplate/components/NumberedTablePagination';
import Panel from 'components/PageTemplate/components/Panel';
import QueryCancelledPlaceholder from 'components/QueryCancelledPlaceholder';

import ExceptionsTable from './ExceptionsTable';
import { useAllErrorsParams } from './useAllErrorsParams';
import { useAllErrorsQueries } from './useAllErrorsQueries';

function AllErrors(): JSX.Element {
	const { t } = useTranslation();
	const params = useAllErrorsParams();
	const { rows, total, isLoading, isCancelled } = useAllErrorsQueries(params);

	if (isCancelled && rows.length === 0) {
		return (
			<QueryCancelledPlaceholder subText='Click "Run Query" to load exceptions.' />
		);
	}

	return (
		<Panel
			testId="exceptions-table"
			title={t('routes.all_errors')}
			subtitle="Grouped by type, message and service"
			className="tw:overflow-hidden"
			bodyClassName="tw:mt-3 tw:border-t tw:border-border"
		>
			<ExceptionsTable rows={rows} loading={isLoading} params={params} />
			<NumberedTablePagination
				page={Math.floor(params.offset / params.pageSize) + 1}
				pageSize={params.pageSize}
				total={total}
				itemLabel="exceptions"
				onChange={params.onPageChange}
			/>
		</Panel>
	);
}

export default AllErrors;
