import { useCallback, useState } from 'react';
import { useQueryClient } from 'react-query';
import getLocalStorageKey from 'api/browser/localstorage/get';
import setLocalStorageApi from 'api/browser/localstorage/set';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import HeaderBandLayout from 'components/PageTemplate/components/HeaderBandLayout';
import QuickFiltersLayout from 'components/QuickFilters/QuickFiltersLayout/QuickFiltersLayout';
import { useSignalFieldApis } from 'components/QuickFilters/hooks/useSignalFieldApis';
import { QuickFiltersSource, SignalType } from 'components/QuickFilters/types';
import { LOCALSTORAGE } from 'constants/localStorage';
import AllErrorsContainer from 'container/AllError';
import RightToolbarActions from 'container/QueryBuilder/components/ToolbarActions/RightToolbarActions';
import ResourceAttributesFilterV2 from 'container/ResourceAttributeFilterV2/ResourceAttributesFilterV2';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { isNull } from 'lodash-es';
import { Bug } from 'lucide-react';

import ExceptionsCountLine from './ExceptionsCountLine';
import { useAllErrorsQueryState } from './QueryStateContext';

import './AllErrors.styles.scss';

function AllErrors(): JSX.Element {
	const { handleRunQuery } = useQueryBuilder();
	const queryClient = useQueryClient();

	const isLoadingQueries = useAllErrorsQueryState((s) => s.isFetching);
	const setIsCancelled = useAllErrorsQueryState((s) => s.setIsCancelled);
	const handleCancelQuery = useCallback(() => {
		queryClient.cancelQueries(['getAllErrors']);
		queryClient.cancelQueries(['getErrorCounts']);
		setIsCancelled(true);
	}, [queryClient, setIsCancelled]);

	const [showFilters, setShowFilters] = useState<boolean>(() => {
		const localStorageValue = getLocalStorageKey(
			LOCALSTORAGE.SHOW_EXCEPTIONS_QUICK_FILTERS,
		);
		if (!isNull(localStorageValue)) {
			return localStorageValue === 'true';
		}
		return true;
	});

	const handleFilterVisibilityChange = (): void => {
		setLocalStorageApi(
			LOCALSTORAGE.SHOW_EXCEPTIONS_QUICK_FILTERS,
			String(!showFilters),
		);
		setShowFilters((prev) => !prev);
	};

	const quickFilterFieldApis = useSignalFieldApis();

	return (
		<HeaderBandLayout
			bounded
			testId="exceptions-page"
			header={
				<CompactPageHeader
					icon={<Bug />}
					iconTone="error"
					title="Exceptions"
					meta={<ExceptionsCountLine />}
				/>
			}
		>
			<QuickFiltersLayout
				className="all-errors-page"
				contentClassName="all-errors-right-section"
				showFilters={showFilters}
				onToggleFilters={handleFilterVisibilityChange}
				quickFilterProps={{
					className: 'qf-exceptions',
					source: QuickFiltersSource.EXCEPTIONS,
					signal: SignalType.EXCEPTIONS,
					useFieldApis: quickFilterFieldApis,
				}}
			>
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6">
					<div className="all-errors-toolbar tw:flex tw:items-start tw:gap-2">
						<div className="tw:min-w-0 tw:flex-1">
							<ResourceAttributesFilterV2 />
						</div>
						<RightToolbarActions
							onStageRunQuery={handleRunQuery}
							isLoadingQueries={isLoadingQueries}
							handleCancelQuery={handleCancelQuery}
						/>
					</div>
					<AllErrorsContainer />
				</div>
			</QuickFiltersLayout>
		</HeaderBandLayout>
	);
}

export default AllErrors;
