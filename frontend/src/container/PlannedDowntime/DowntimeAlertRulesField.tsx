import { Form, Select, SelectProps, Spin } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';

import { AlertRuleTags } from './AlertRuleTags';
import { AlertRuleScope } from './types';

export const ALERT_RULES_FIELD = 'alertRules';

const SCOPE_OPTIONS: {
	value: AlertRuleScope;
	label: string;
	testId: string;
}[] = [
	{ value: 'all', label: 'All alert rules', testId: 'downtime-scope-all' },
	{
		value: 'specific',
		label: 'Specific alert rules',
		testId: 'downtime-scope-specific',
	},
];

const noTagRenderer: SelectProps['tagRender'] = () => <></>;

interface DowntimeAlertRulesFieldProps {
	alertRuleScope: AlertRuleScope;
	onScopeChange: (scope: AlertRuleScope) => void;
	selectedTags: DefaultOptionType[];
	onRulesChange: SelectProps['onChange'];
	onRemoveRule: (removedTag: DefaultOptionType['value']) => void;
	alertOptions: DefaultOptionType[];
	isError: boolean;
	isLoading: boolean;
}

/** "Silence Alerts": every rule, or the rules picked here. */
export function DowntimeAlertRulesField({
	alertRuleScope,
	onScopeChange,
	selectedTags,
	onRulesChange,
	onRemoveRule,
	alertOptions,
	isError,
	isLoading,
}: DowntimeAlertRulesFieldProps): JSX.Element {
	return (
		<div className="tw:mb-6 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-3">
			<p className="fs-ui tw:m-0 tw:mb-2 tw:font-sans tw:text-sm tw:font-medium tw:text-foreground">
				Silence Alerts
			</p>
			<Form.Item
				name="alertRuleScope"
				initialValue="specific"
				className="tw:mb-3!"
			>
				<SegmentedControl<AlertRuleScope>
					label="Silence Alerts"
					options={SCOPE_OPTIONS}
					value={alertRuleScope}
					onChange={onScopeChange}
				/>
			</Form.Item>
			{alertRuleScope === 'specific' && (
				<>
					<Form.Item noStyle shouldUpdate>
						<AlertRuleTags
							closable
							selectedTags={selectedTags}
							handleClose={onRemoveRule}
						/>
					</Form.Item>
					<Form.Item
						name={ALERT_RULES_FIELD}
						className="tw:mb-0!"
						rules={[
							{
								validator: async (
									_rule,
									value: DefaultOptionType[] | undefined,
								): Promise<void> => {
									if (!value || value.length === 0) {
										throw new Error(
											'Select at least one alert rule, or choose "All alert rules" to silence everything.',
										);
									}
								},
							},
						]}
					>
						<Select
							placeholder="Search for alert rules or groups..."
							mode="multiple"
							status={isError ? 'error' : undefined}
							loading={isLoading}
							tagRender={noTagRenderer}
							onChange={onRulesChange}
							showSearch
							options={alertOptions}
							filterOption={(input, option): boolean =>
								(option?.label as string)?.toLowerCase()?.includes(input.toLowerCase())
							}
							notFoundContent={
								isLoading ? (
									<span>
										<Spin size="small" /> Loading...
									</span>
								) : (
									<span>No alert available.</span>
								)
							}
						>
							{alertOptions?.map((option) => (
								<Select.Option key={option.value} value={option.value}>
									{option.label}
								</Select.Option>
							))}
						</Select>
					</Form.Item>
				</>
			)}
		</div>
	);
}
