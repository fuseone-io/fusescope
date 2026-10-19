import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigProvider, Form } from 'antd';
import { Button } from 'components/ui/button';
import { Sheet, SheetContent, SheetTitle } from 'components/ui/sheet';
import { X } from 'lucide-react';
import {
	ActionMode,
	ActionType,
	PipelineData,
	ProcessorData,
} from 'types/api/pipeline/def';
import { v4 } from 'uuid';

import { getEditedDataSource, getRecordIndex } from '../utils';
import { DEFAULT_PROCESSOR_TYPE, processorFields } from './config';
import TypeSelect from './FormFields/TypeSelect';
import ProcessorForm from './ProcessorForm';

function AddNewProcessor({
	isActionType,
	setActionType,
	selectedProcessorData,
	setShowSaveButton,
	expandedPipelineData,
	setExpandedPipelineData,
}: AddNewProcessorProps): JSX.Element {
	const [form] = Form.useForm();
	const { t } = useTranslation('pipeline');
	const [processorType, setProcessorType] = useState<string>(
		DEFAULT_PROCESSOR_TYPE,
	);

	// Remounts the fields once the form holds the processor's values: the sheet
	// mounts its content before this component's effect fills the form.
	const [formVersion, setFormVersion] = useState(0);

	const isEdit = isActionType === 'edit-processor';
	const isAdd = isActionType === 'add-processor';

	useEffect(() => {
		if (isEdit || isAdd) {
			// Reset form first to clear any stale fields from previous processors
			form.resetFields();
		}
		if (isEdit && selectedProcessorData && expandedPipelineData?.config) {
			const findRecordIndex = getRecordIndex(
				expandedPipelineData?.config,
				selectedProcessorData,
				'id',
			);

			const updatedProcessorData = {
				...expandedPipelineData?.config?.[findRecordIndex],
			};
			setProcessorType(updatedProcessorData.type);
			form.setFieldsValue(updatedProcessorData);
		}
		if (isEdit || isAdd) {
			setFormVersion((version) => version + 1);
		}
	}, [form, isEdit, isAdd, selectedProcessorData, expandedPipelineData?.config]);

	const handleProcessorType = (value: string | unknown): void => {
		const typedValue = String(value) || DEFAULT_PROCESSOR_TYPE;
		setProcessorType(typedValue);
	};

	const onFinish = (values: { name: string }): void => {
		const totalDataLength = expandedPipelineData?.config?.length || 0;

		const newProcessorData = {
			id: v4(),
			orderId: Number(totalDataLength || 0) + 1,
			type: processorType,
			enabled: true,
			...values,
		};

		if (isEdit && selectedProcessorData && expandedPipelineData?.config) {
			const findRecordIndex = getRecordIndex(
				expandedPipelineData?.config,
				selectedProcessorData,
				'id',
			);

			const processorData = expandedPipelineData?.config?.[findRecordIndex];

			const updatedProcessorData = {
				id: processorData?.id || v4(),
				orderId: processorData?.orderId,
				type: processorType,
				enabled: processorData?.enabled,
				output: processorData?.output,
				...values,
			};

			const editedData = getEditedDataSource(
				expandedPipelineData.config,
				selectedProcessorData,
				'name',
				updatedProcessorData,
			);

			const modifiedProcessorData = { ...expandedPipelineData };

			modifiedProcessorData.config = editedData;

			setExpandedPipelineData(modifiedProcessorData);
		}
		if (isAdd && expandedPipelineData) {
			const modifiedProcessorData = {
				...expandedPipelineData,
			};
			if (
				modifiedProcessorData.config !== undefined &&
				modifiedProcessorData.config
			) {
				modifiedProcessorData.config = [
					...modifiedProcessorData.config,
					newProcessorData,
				];
				if (totalDataLength > 0) {
					modifiedProcessorData.config[totalDataLength - 1].output =
						newProcessorData.id;
				}
			}
			setExpandedPipelineData(modifiedProcessorData);
		}
		setActionType(undefined);
		handleProcessorType(DEFAULT_PROCESSOR_TYPE);
	};

	const onCancelModal = (): void => {
		setActionType(undefined);
		handleProcessorType(DEFAULT_PROCESSOR_TYPE);
	};

	const modalTitle = useMemo(
		(): string =>
			isEdit
				? `${t('edit_processor')} ${selectedProcessorData?.name}`
				: t('create_processor'),
		[isEdit, selectedProcessorData?.name, t],
	);

	const onOkModalHandler = useCallback(
		() => setShowSaveButton(ActionMode.Editing),
		[setShowSaveButton],
	);

	const isOpen = useMemo(() => isEdit || isAdd, [isAdd, isEdit]);

	const onFormValuesChanged = useCallback(
		(changedValues: ProcessorData): void => {
			processorFields[processorType].forEach((field) => {
				if (field.onFormValuesChanged) {
					field.onFormValuesChanged(changedValues, form);
				}
			});
		},
		[form, processorType],
	);

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open): void => {
				if (!open) {
					onCancelModal();
				}
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				aria-describedby={undefined}
				data-testid="processor-sheet"
				className="processor-sheet tw:max-w-full tw:gap-0 tw:p-0 tw:sm:max-w-none"
				style={{ width: PROCESSOR_SHEET_WIDTH }}
			>
				{/* antd popups render inside the sheet, which is the only clickable layer. */}
				<ConfigProvider
					getPopupContainer={(trigger): HTMLElement =>
						trigger?.closest<HTMLElement>('.processor-sheet') ?? document.body
					}
				>
					<Form
						name="add-new-processor"
						layout="vertical"
						onFinish={onFinish}
						autoComplete="off"
						form={form}
						onValuesChange={onFormValuesChanged}
						className="processor-sheet__form"
					>
						<div className="processor-sheet__header">
							<div>
								<SheetTitle className="processor-sheet__title">{modalTitle}</SheetTitle>
								{expandedPipelineData?.name && (
									<p className="processor-sheet__subtitle">
										In pipeline {expandedPipelineData.name}
									</p>
								)}
							</div>
							<button
								type="button"
								aria-label="Close"
								className="processor-sheet__close"
								onClick={onCancelModal}
							>
								<X size={16} />
							</button>
						</div>
						<div className="processor-sheet__body">
							<TypeSelect value={processorType} onChange={handleProcessorType} />
							<ProcessorForm
								key={formVersion}
								processorType={processorType}
								selectedProcessorData={selectedProcessorData}
								isAdd={isAdd}
							/>
						</div>
						<div className="processor-sheet__footer">
							<Button
								key="cancel"
								type="button"
								variant="outline"
								size="sm"
								onClick={onCancelModal}
							>
								{t('cancel')}
							</Button>
							<Button key="submit" type="submit" size="sm" onClick={onOkModalHandler}>
								{isEdit ? t('update') : t('create')}
							</Button>
						</div>
					</Form>
				</ConfigProvider>
			</SheetContent>
		</Sheet>
	);
}

const PROCESSOR_SHEET_WIDTH = 520;

AddNewProcessor.defaultProps = {
	selectedProcessorData: undefined,
	expandedPipelineData: {},
};

interface AddNewProcessorProps {
	isActionType: string;
	setActionType: (actionType?: ActionType) => void;
	selectedProcessorData?: ProcessorData;
	setShowSaveButton: (actionMode: ActionMode) => void;
	expandedPipelineData?: PipelineData;
	setExpandedPipelineData: (data: PipelineData) => void;
}

export default AddNewProcessor;
