import { RefreshCw } from '@signozhq/icons';
import { Button } from '@signozhq/ui/button';
import { Tooltip } from '@signozhq/ui/tooltip';
import useActiveQueryIndex from 'components/QuickFilters/hooks/useActiveQueryIndex';
import useFilterConfig from 'components/QuickFilters/hooks/useFilterConfig';
import {
	FiltersType,
	QuickFilterCheckboxUseFieldApis,
	QuickFiltersSource,
	SignalType,
} from 'components/QuickFilters/types';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import { QuickFilterReadPermission } from 'lib/authz/hooks/useAuthZ/permissions/quick-filter.permissions';

import QuickFilterSelect from './QuickFilterSelect';
import QuickFilterSettingsButton from './QuickFilterSettingsButton';
import { clearQueryFilters, quickFilterSummary } from './quickFilterBarUtils';

const SOURCE = QuickFiltersSource.AI_OBSERVABILITY;
const SIGNAL = SignalType.AI_OBSERVABILITY;
const NO_CONFIG: never[] = [];

interface QuickFilterBarProps {
	useFieldApis: QuickFilterCheckboxUseFieldApis;
}

/** The workspace's quick filters as a row of selects above the results. */
function QuickFilterBar({ useFieldApis }: QuickFilterBarProps): JSX.Element {
	const { filterConfig, customFilters, refetchCustomFilters } = useFilterConfig({
		signal: SIGNAL,
		config: NO_CONFIG,
	});
	const { currentQuery, redirectWithQueryBuilderData } = useQueryBuilder();
	const compositeQuery = useGetCompositeQueryParam();
	const activeQueryIndex = useActiveQueryIndex(SOURCE);
	const items =
		compositeQuery?.builder.queryData?.[activeQueryIndex]?.filters?.items ?? [];

	// The slider renderer is an empty placeholder, so it has nothing to offer here.
	const shownFilters = filterConfig.filter(
		(filter) => filter.type !== FiltersType.SLIDER,
	);

	return (
		<div
			role="group"
			aria-label="Quick filters"
			data-testid="llm-quick-filter-bar"
			className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-sans"
		>
			<AuthZGuardContent checks={[QuickFilterReadPermission]}>
				<>
					{shownFilters.map((filter) => (
						<QuickFilterSelect
							key={filter.attributeKey.key}
							filter={filter}
							source={SOURCE}
							summary={quickFilterSummary(
								items,
								filter.attributeKey.key,
								filter.type === FiltersType.DURATION ? 'range' : 'values',
							)}
							useFieldApis={useFieldApis}
						/>
					))}
					{shownFilters.length === 0 && (
						<span
							data-testid="llm-quick-filter-bar-empty"
							className="tw:text-xs tw:text-muted-foreground"
						>
							No quick filters
						</span>
					)}
				</>
			</AuthZGuardContent>
			<Tooltip title="Reset all quick filters">
				<Button
					variant="ghost"
					color="secondary"
					size="sm"
					icon
					aria-label="Reset All"
					testId="llm-quick-filter-reset"
					onClick={(): void =>
						redirectWithQueryBuilderData(
							clearQueryFilters(currentQuery, activeQueryIndex),
						)
					}
				>
					<RefreshCw size={14} />
				</Button>
			</Tooltip>
			<QuickFilterSettingsButton
				signal={SIGNAL}
				customFilters={customFilters}
				refetchCustomFilters={refetchCustomFilters}
			/>
		</div>
	);
}

export default QuickFilterBar;
