import { Checkbox, Select } from 'antd';
import cx from 'classnames';

import type { UpdatedWindow } from '../../types';

import styles from './FilterZone.module.scss';

export interface CreatorOption {
	email: string;
	label: string;
}

const UPDATED_LABELS: Record<UpdatedWindow, string> = {
	any: 'Any time',
	today: 'Today',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days',
};

const UPDATED_WINDOWS: UpdatedWindow[] = ['any', 'today', '7d', '30d'];
const UPDATED_OPTIONS = UPDATED_WINDOWS.map((w) => ({
	value: w,
	label: UPDATED_LABELS[w],
}));

interface Props {
	createdBy: string[];
	updated: UpdatedWindow;
	creatorOptions: CreatorOption[];
	onCreatedByChange: (emails: string[]) => void;
	onUpdatedChange: (window: UpdatedWindow) => void;
	// Run the staged draft — fired when a dropdown closes.
	onApply: () => void;
	// Clear all Created-by selections and run immediately.
	onClearCreatedBy: () => void;
	disabled?: boolean;
}

function FilterChips({
	createdBy,
	updated,
	creatorOptions,
	onCreatedByChange,
	onUpdatedChange,
	onApply,
	onClearCreatedBy,
	disabled = false,
}: Props): JSX.Element {
	const creatorOptionsData = creatorOptions.map((o) => ({
		value: o.email,
		label: o.label,
	}));

	const runOnClose = (open: boolean): void => {
		if (!open) {
			onApply();
		}
	};

	return (
		<div className={styles.chips}>
			<div className={cx(styles.filterField, styles.fieldWide)}>
				<span className={styles.filterLabel}>Created by</span>
				<Select
					mode="multiple"
					showSearch
					allowClear
					bordered={false}
					className={styles.select}
					placeholder="Anyone"
					value={createdBy}
					options={creatorOptionsData}
					optionFilterProp="label"
					maxTagCount={1}
					menuItemSelectedIcon={null}
					popupMatchSelectWidth={260}
					data-testid="dashboards-filter-created-by"
					disabled={disabled}
					onClear={onClearCreatedBy}
					optionRender={(option): JSX.Element => (
						<div className={styles.creatorOption}>
							<Checkbox
								checked={createdBy.includes(option.value as string)}
								className={styles.creatorCheck}
							/>
							<span className={styles.creatorLabel}>{option.label}</span>
						</div>
					)}
					onChange={(value): void => onCreatedByChange(value as string[])}
					onDropdownVisibleChange={runOnClose}
				/>
			</div>
			<div className={cx(styles.filterField, styles.fieldNarrow)}>
				<span className={styles.filterLabel}>Updated</span>
				<Select
					showSearch
					bordered={false}
					className={styles.select}
					placeholder="Any time"
					value={updated}
					options={UPDATED_OPTIONS}
					optionFilterProp="label"
					popupMatchSelectWidth={160}
					data-testid="dashboards-filter-updated"
					disabled={disabled}
					onChange={(value): void => onUpdatedChange(value as UpdatedWindow)}
				/>
			</div>
		</div>
	);
}

export default FilterChips;
