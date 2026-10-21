// eslint-disable-next-line signoz/no-antd-components -- fixed-option sort picker
import { Select } from 'antd';
import { CustomSelect } from 'components/NewSelect';
import { Switch } from 'components/ui/switch';

import {
	VARIABLE_SORT_LABEL,
	VARIABLE_SORTS,
	type VariableFormModel,
	type VariableSort,
} from '../variableFormModel';
import { VALUE_CHIP } from '../../components/settingsClassNames';
import SettingsField from '../../components/SettingsField';
import styles from './VariableForm.module.scss';

const SWITCH_LABEL = 'tw:cursor-pointer tw:text-[13px] tw:text-foreground';

interface ListVariableFieldsProps {
	model: VariableFormModel;
	onChange: (patch: Partial<VariableFormModel>) => void;
	previewValues: (string | number)[];
	previewError: string | null;
	defaultValue: string;
	onDefaultValueChange: (value: string) => void;
	/** Whether the "ALL values" toggle applies to this type (QUERY / CUSTOM). */
	showAllOptionField: boolean;
}

/**
 * Rows shared by the list-style variables (Query / Custom / Dynamic): the value
 * preview, sort, default-value picker and the multi-select / ALL toggles.
 */
function ListVariableFields({
	model,
	onChange,
	previewValues,
	previewError,
	defaultValue,
	onDefaultValueChange,
	showAllOptionField,
}: ListVariableFieldsProps): JSX.Element {
	return (
		<>
			<SettingsField label="Preview of Values">
				<div className="tw:flex tw:max-h-28 tw:flex-wrap tw:gap-1 tw:overflow-y-auto">
					{previewError ? (
						<span className="tw:text-xs tw:text-warning-ink">{previewError}</span>
					) : (
						previewValues.map((value, idx) => (
							<span
								// eslint-disable-next-line react/no-array-index-key -- preview values are display-only and may contain duplicates
								key={`${value}-${idx}`}
								className={VALUE_CHIP}
							>
								<span className="tw:truncate">{value.toString()}</span>
							</span>
						))
					)}
					{!previewError && previewValues.length === 0 && (
						<span className="tw:text-xs tw:text-subtle-foreground">No values</span>
					)}
				</div>
			</SettingsField>

			<div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] tw:items-start tw:gap-4 tw:border-t tw:border-border tw:pt-4">
				<SettingsField label="Sort Values">
					<Select
						className={styles.select}
						popupMatchSelectWidth={false}
						value={model.sort}
						options={VARIABLE_SORTS.map((sort) => ({
							label: VARIABLE_SORT_LABEL[sort],
							value: sort,
						}))}
						onChange={(value): void => onChange({ sort: value as VariableSort })}
						data-testid="variable-sort-select"
					/>
				</SettingsField>

				<SettingsField
					label="Default Value"
					description={
						model.type === 'QUERY'
							? 'Click Test Run Query to see the values or add custom value'
							: 'Select a value from the preview values or add custom value'
					}
				>
					<CustomSelect
						className={styles.select}
						showSearch
						allowClear
						placeholder="Select a default value"
						value={defaultValue || undefined}
						onChange={(value): void => onDefaultValueChange((value as string) ?? '')}
						options={previewValues.map((value) => ({
							label: value.toString(),
							value: value.toString(),
						}))}
						data-testid="variable-default-select"
					/>
				</SettingsField>
			</div>

			<div className="tw:flex tw:flex-col tw:gap-3">
				<div className="tw:flex tw:items-center tw:gap-2.5">
					<Switch
						id="variable-form-multi"
						checked={model.multiSelect}
						onCheckedChange={(checked): void =>
							onChange({
								multiSelect: checked,
								showAllOption: checked ? model.showAllOption : false,
							})
						}
						data-testid="variable-multi-switch"
					/>
					<label htmlFor="variable-form-multi" className={SWITCH_LABEL}>
						Enable multiple values to be checked
					</label>
				</div>

				{model.multiSelect && showAllOptionField ? (
					<div className="tw:flex tw:items-center tw:gap-2.5 tw:pl-5">
						<Switch
							id="variable-form-all"
							checked={model.showAllOption}
							onCheckedChange={(checked): void => onChange({ showAllOption: checked })}
							data-testid="variable-all-switch"
						/>
						<label htmlFor="variable-form-all" className={SWITCH_LABEL}>
							Include an option for ALL values
						</label>
					</div>
				) : null}
			</div>
		</>
	);
}

export default ListVariableFields;
