import { useRef, useState } from 'react';
import { ConfigProvider } from 'antd';
import { CustomMultiSelect } from 'components/NewSelect';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Check, Loader2, X } from 'lucide-react';

import DynamicVariableFields from './DynamicVariableFields';
import ListVariableFields from './ListVariableFields';
import QueryVariableFields from './QueryVariableFields';
import { useVariableForm } from './useVariableForm';
import VariableTypeTabs from './VariableTypeTabs';
import styles from './VariableForm.module.scss';
import BackToAllVariables from '../components/BackToAllVariables/BackToAllVariables';
import { VariableFormProps } from '../types';
import VariableInfoForm from '../components/VariableInfoForm/VariableInfoForm';
import {
	BUTTON_GHOST,
	BUTTON_SM,
	FIELD_INPUT,
	FIELD_TEXTAREA,
} from '../../components/settingsClassNames';
import DisabledReason from '../../components/DisabledReason';
import SettingsField from '../../components/SettingsField';
import SettingsSheetBody from '../../components/SettingsSheetBody';
import SettingsSheetFooter from '../../components/SettingsSheetFooter';

// The legacy selects inside match the 36px, 8px-radius fields around them.
const LEGACY_FIELD_THEME = {
	token: { controlHeight: 36, borderRadius: 8, borderRadiusLG: 12 },
};

/**
 * In-sheet variable editor (antd kept only for the searchable selects).
 * Master→detail: renders in place of the list. Form state/handlers live in
 * {@link useVariableForm}; the shared list-type rows in {@link ListVariableFields}.
 */
function VariableForm({
	initial,
	siblings,
	isNew,
	isSaving,
	panelOptions,
	appliedPanelIds,
	onClose,
	onSave,
}: VariableFormProps): JSX.Element {
	// The "apply to panels" selection is transient form state, seeded from the
	// panels that already reference this variable. Held in a ref so the save
	// callback (owned by useVariableForm) reads the latest value.
	const [selectedPanelIds, setSelectedPanelIds] =
		useState<string[]>(appliedPanelIds);
	const selectedPanelIdsRef = useRef(selectedPanelIds);
	selectedPanelIdsRef.current = selectedPanelIds;

	const {
		model,
		set,
		onNameChange,
		selectType,
		onCustomChange,
		onDynamicChange,
		setRawPreview,
		previewValues,
		previewError,
		setPreviewError,
		defaultValue,
		setDefaultValue,
		visibleNameError,
		nameError,
		attributeError,
		cycleError,
		isListType,
		showAllOptionField,
		payloadVariables,
		handleSave,
	} = useVariableForm({
		initial,
		siblings,
		isNew,
		onSave: (next): void => onSave(next, selectedPanelIdsRef.current),
	});

	// Shared list rows (preview/sort/multi/default) for the list-type variables;
	// rendered as a sibling inside each list-type panel. Only the active panel
	// mounts, so reusing one element is safe.
	const listFields = isListType ? (
		<ListVariableFields
			model={model}
			onChange={set}
			previewValues={previewValues}
			previewError={previewError}
			defaultValue={defaultValue}
			onDefaultValueChange={setDefaultValue}
			showAllOptionField={showAllOptionField}
		/>
	) : null;

	const saveDisabledReason = nameError || attributeError || undefined;

	return (
		<ConfigProvider theme={LEGACY_FIELD_THEME}>
			<SettingsSheetBody className="tw:gap-[18px] tw:pt-4">
				<BackToAllVariables onClose={onClose} />

				<VariableInfoForm
					title={model.name}
					description={model.description}
					onTitleChange={onNameChange}
					onDescriptionChange={(value): void => set({ description: value })}
					visibleNameError={visibleNameError}
				/>

				<VariableTypeTabs
					value={model.type}
					onChange={selectType}
					panels={{
						DYNAMIC: (
							<>
								<DynamicVariableFields
									attribute={model.dynamicAttribute}
									signal={model.dynamicSignal}
									onChange={onDynamicChange}
									onPreview={setRawPreview}
									attributeError={attributeError}
								/>
								<SettingsField label="Apply to panels">
									<CustomMultiSelect
										className={styles.select}
										placeholder="Select panels"
										options={panelOptions}
										value={selectedPanelIds}
										onChange={(value): void => setSelectedPanelIds(value as string[])}
										data-testid="variable-apply-panels"
										// Resolve the closed-state tags to panel names (else they show the id).
										showLabels
										placement="topRight"
									/>
								</SettingsField>
								{listFields}
							</>
						),
						QUERY: (
							<>
								<QueryVariableFields
									queryValue={model.queryValue}
									variables={payloadVariables}
									onChange={(queryValue): void => set({ queryValue })}
									onPreview={setRawPreview}
									onError={setPreviewError}
								/>
								{listFields}
							</>
						),
						CUSTOM: (
							<>
								<SettingsField
									label="Options"
									htmlFor="variable-form-custom-options"
									hint="comma-separated"
								>
									<textarea
										id="variable-form-custom-options"
										className={cn(FIELD_TEXTAREA, 'tw:font-mono tw:text-xs')}
										rows={4}
										value={model.customValue}
										placeholder="Enter options separated by commas."
										onChange={(e): void => onCustomChange(e.target.value)}
										data-testid="variable-custom-input"
									/>
								</SettingsField>
								{listFields}
							</>
						),
						TEXT: (
							<SettingsField
								label="Default Value"
								htmlFor="variable-form-text-default"
							>
								<input
									id="variable-form-text-default"
									className={cn(FIELD_INPUT, 'tw:font-mono tw:text-xs')}
									value={model.textValue}
									placeholder="Enter a default value (if any)..."
									onChange={(e): void => set({ textValue: e.target.value })}
									data-testid="variable-text-input"
								/>
							</SettingsField>
						),
					}}
				/>

				{cycleError ? (
					<span role="alert" className="tw:text-xs tw:text-warning-ink">
						{cycleError}
					</span>
				) : null}
			</SettingsSheetBody>

			<SettingsSheetFooter>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={BUTTON_GHOST}
					onClick={onClose}
				>
					<X aria-hidden="true" />
					Discard
				</Button>
				<DisabledReason reason={saveDisabledReason}>
					<Button
						type="button"
						size="sm"
						className={cn(BUTTON_SM, 'tw:hover:bg-primary-strong')}
						disabled={!!saveDisabledReason || isSaving}
						onClick={handleSave}
						data-testid="variable-save"
					>
						{isSaving ? (
							<Loader2 className="tw:animate-spin" aria-hidden="true" />
						) : (
							<Check aria-hidden="true" />
						)}
						<span>Save Variable</span>
					</Button>
				</DisabledReason>
			</SettingsSheetFooter>
		</ConfigProvider>
	);
}

export default VariableForm;
