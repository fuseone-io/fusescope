import { useMemo, useState } from 'react';
import { Skeleton } from 'antd';
import useActiveQueryIndex from 'components/QuickFilters/hooks/useActiveQueryIndex';
import {
	IQuickFiltersConfig,
	QuickFilterChangeEventData,
	QuickFiltersSource,
} from 'components/QuickFilters/types';
import { severityColor } from 'components/Logs/LogStateIndicator/severityTint';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { NormalizedSeverity } from 'utils/logSeverity';

import { CheckboxFilterV2Header } from '../Checkbox/v2/CheckboxFilterV2Header';
import { CheckboxFilterV2ValueRow } from '../Checkbox/v2/CheckboxFilterV2ValueRow';
import { selectedSeverityLevels } from './severityFilterQuery';
import { useSeverityCounts } from './useSeverityCounts';
import { useSeverityFilterActions } from './useSeverityFilterActions';

import styles from './SeverityFilter.module.scss';

interface SeverityFilterProps {
	filter: IQuickFiltersConfig;
	source: QuickFiltersSource;
	onFilterChange?: (query: Query) => void;
	onQuickFilterChange?: (data: QuickFilterChangeEventData) => void;
}

/**
 * The logs severity facet: the six OTel levels (and Unknown when present),
 * each counting every spelling of its `severity_text`.
 */
function SeverityFilter({
	filter,
	source,
	onFilterChange,
	onQuickFilterChange,
}: SeverityFilterProps): JSX.Element {
	const queryIndex = useActiveQueryIndex(source);
	const { currentQuery } = useQueryBuilder();
	const queryData = currentQuery.builder.queryData[queryIndex];

	const selected = useMemo(
		() =>
			selectedSeverityLevels(
				queryData?.filter?.expression || '',
				queryData?.filters?.items || [],
			),
		[queryData],
	);

	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const isOpen = userOpen ?? (selected !== null || filter.defaultOpen);

	const { counts, isLoading } = useSeverityCounts({
		queryIndex,
		enabled: isOpen,
	});
	const applyLevels = useSeverityFilterActions({
		filter,
		queryIndex,
		onFilterChange,
		onQuickFilterChange,
	});

	const rows = useMemo(() => {
		const present = counts.map((row) => row.level);
		const missingSelected = (selected || [])
			.filter((level) => !present.includes(level))
			.map((level) => ({ level, count: 0 }));
		return [...counts, ...missingSelected];
	}, [counts, selected]);

	const levels = rows.map((row) => row.level);
	const isChecked = (level: NormalizedSeverity): boolean =>
		selected === null || selected.includes(level);

	const withSelection = (next: NormalizedSeverity[]): void => {
		const covered = levels.every((level) => next.includes(level));
		applyLevels(next.length === 0 || covered ? null : next);
	};

	const onToggle = (level: NormalizedSeverity, checked: boolean): void => {
		const current = selected ?? levels;
		withSelection(
			checked
				? [...current, level]
				: current.filter((selectedLevel) => selectedLevel !== level),
		);
	};

	const onOnly = (level: NormalizedSeverity): void => {
		const isOnlyThis = selected?.length === 1 && selected[0] === level;
		applyLevels(isOnlyThis ? null : [level]);
	};

	return (
		<div className={styles.severityFilter} data-testid="severity-filter">
			<CheckboxFilterV2Header
				title={filter.title}
				attributeKey={filter.attributeKey.key}
				dataType={filter.attributeKey.dataType}
				isOpen={isOpen}
				actionsClassName={styles.actions}
				onToggleOpen={(): void => setUserOpen(!isOpen)}
				onToggleSearch={(): void => {}}
				onClear={(): void => applyLevels(null)}
			/>
			{isOpen && isLoading && !rows.length && (
				<section className={styles.loading}>
					<Skeleton paragraph={{ rows: 3 }} title={false} />
				</section>
			)}
			{isOpen && !isLoading && !rows.length && (
				<section className={styles.empty}>No values found</section>
			)}
			{isOpen && rows.length > 0 && (
				<section className={styles.values}>
					{rows.map(({ level, count }) => {
						const label = level;
						const checked = isChecked(level);
						return (
							<CheckboxFilterV2ValueRow
								key={level}
								value={label}
								checkedState={checked ? 'checked' : 'unchecked'}
								disabled={false}
								title={filter.title}
								onlyButtonLabel={
									selected?.length === 1 && selected[0] === level ? 'All' : 'Only'
								}
								badge={null}
								customRendererForValue={(): JSX.Element => (
									<span className={styles.level}>
										<span
											aria-hidden="true"
											className={styles.swatch}
											style={{ background: severityColor(level) }}
										/>
										<span className={styles.label}>{label}</span>
										<span className={styles.count}>{count.toLocaleString()}</span>
									</span>
								)}
								onCheckboxChange={(next): void => onToggle(level, next)}
								onOnlyOrAllClick={(): void => onOnly(level)}
							/>
						);
					})}
				</section>
			)}
		</div>
	);
}

export default SeverityFilter;
