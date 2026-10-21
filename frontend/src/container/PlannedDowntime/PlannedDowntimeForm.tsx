import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import {
	DatePicker,
	Form,
	FormInstance,
	Input,
	Select,
	SelectProps,
} from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import type {
	AlertmanagertypesPlannedMaintenanceDTO,
	AlertmanagertypesRecurrenceDTO,
} from 'api/generated/services/fuseScope.schemas';
import FormSheet from 'components/Alerts/FormSheet/FormSheet';
import { Button } from 'components/ui/button';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { defaultTo, isEmpty } from 'lodash-es';
import { Check, Loader2 } from 'lucide-react';

import 'dayjs/locale/en';

import {
	ALERT_RULES_FIELD,
	DowntimeAlertRulesField,
} from './DowntimeAlertRulesField';
import { TZ_OPTIONS } from './constants';
import { DowntimeRecurrenceFields } from './DowntimeRecurrenceFields';
import { DowntimeScopeField } from './DowntimeScopeField';
import {
	getAlertOptionsFromIds,
	getDurationInfo,
	isScheduleRecurring,
	recurrenceOptions,
} from './PlannedDowntimeutils';
import { AlertRuleScope, PlannedDowntimeFormData } from './types';
import { useSaveDowntime } from './useSaveDowntime';
import { useScheduleInfoText } from './useScheduleInfoText';

dayjs.locale('en');
dayjs.extend(utc);
dayjs.extend(timezone);

const customFormat = DATE_TIME_FORMATS.ORDINAL_DATETIME;

interface PlannedDowntimeFormProps {
	initialValues: Partial<AlertmanagertypesPlannedMaintenanceDTO>;
	alertOptions: DefaultOptionType[];
	isError: boolean;
	isLoading: boolean;
	isOpen: boolean;
	setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
	refetchAllSchedules: () => void;
	isEditMode: boolean;
	form: FormInstance;
}

export function PlannedDowntimeForm(
	props: PlannedDowntimeFormProps,
): JSX.Element {
	const {
		initialValues,
		alertOptions,
		isError,
		isLoading,
		isOpen,
		setIsOpen,
		refetchAllSchedules,
		isEditMode,
		form,
	} = props;

	const [selectedTags, setSelectedTags] = React.useState<DefaultOptionType[]>(
		[],
	);
	const alertRuleFormName = ALERT_RULES_FIELD;
	const [durationUnit, setDurationUnit] = useState<string>(
		getDurationInfo(initialValues.schedule?.recurrence?.duration)?.unit || 'm',
	);

	const [formData, setFormData] = useState<Partial<PlannedDowntimeFormData>>({
		timezone: initialValues.schedule?.timezone,
	});

	const [recurrenceType, setRecurrenceType] = useState<string>(
		initialValues.schedule?.recurrence?.repeatType ||
			recurrenceOptions.doesNotRepeat.value,
	);

	const [alertRuleScope, setAlertRuleScope] = useState<AlertRuleScope>(
		initialValues.id && (initialValues.alertIds || []).length === 0
			? 'all'
			: 'specific',
	);

	const requiredFieldRule = [{ required: true }];

	const datePickerFooter = (mode: string): ReactNode =>
		mode === 'time' ? (
			<span className="tw:text-muted-foreground">Please select the time</span>
		) : null;

	const { saveLoading, saveHandler } = useSaveDowntime({
		id: initialValues.id,
		isEditMode,
		setIsOpen,
		refetchAllSchedules,
	});
	const onFinish = async (values: PlannedDowntimeFormData): Promise<void> => {
		const rec = values.recurrence;
		const recurrence =
			rec && rec.repeatType !== recurrenceOptions.doesNotRepeat.value
				? {
						duration: `${rec.duration}${durationUnit}`,
						repeatOn: rec.repeatOn,
						repeatType: rec.repeatType,
					}
				: undefined;

		await saveHandler({ ...values, recurrence });
	};

	const handleFormData = (data: Partial<PlannedDowntimeFormData>): void => {
		const { startTime, endTime, timezone } = data;
		const update: Partial<PlannedDowntimeFormData> = {};

		// If the set timezone doesn't match, update it.
		if (
			startTime &&
			timezone &&
			startTime.format() !== startTime.tz(timezone, true).format()
		) {
			update.startTime = startTime.tz(timezone, true);
		}
		if (
			endTime &&
			timezone &&
			endTime.format() !== endTime.tz(timezone, true).format()
		) {
			update.endTime = endTime.tz(timezone, true);
		}

		if (!isEmpty(update)) {
			data = { ...data, ...update };
			form.setFieldsValue({ ...update });
		}

		setFormData(data);
	};

	const handleOk = async (): Promise<void> => {
		await form.validateFields().catch(() => {
			// antd renders inline field-level errors; nothing more to do here.
		});
	};

	const handleCancel = (): void => setIsOpen(false);

	const handleAlertRulesChange: SelectProps['onChange'] = (_value, options) => {
		form.setFieldValue(alertRuleFormName, options);
		setSelectedTags(Array.isArray(options) ? options : [options]);
	};

	const handleClose = (removedTag: DefaultOptionType['value']): void => {
		if (!removedTag) {
			return;
		}
		const newTags = selectedTags.filter((tag) => tag.value !== removedTag);
		form.setFieldValue(alertRuleFormName, newTags);
		setSelectedTags(newTags);
	};

	const formattedInitialValues = useMemo((): PlannedDowntimeFormData => {
		const { schedule } = initialValues;
		const initialAlertIds = initialValues.alertIds || [];

		return {
			name: defaultTo(initialValues.name, ''),
			alertRuleScope:
				isEditMode && initialAlertIds.length === 0 ? 'all' : 'specific',
			alertRules: getAlertOptionsFromIds(initialAlertIds, alertOptions),
			startTime: schedule?.startTime
				? dayjs(schedule.startTime).tz(schedule.timezone)
				: null,
			endTime: schedule?.endTime
				? dayjs(schedule.endTime).tz(schedule.timezone)
				: null,
			recurrence: {
				...schedule?.recurrence,
				repeatType: !isScheduleRecurring(schedule)
					? recurrenceOptions.doesNotRepeat.value
					: schedule?.recurrence?.repeatType,
				duration: getDurationInfo(schedule?.recurrence?.duration)?.value ?? '',
			} as AlertmanagertypesRecurrenceDTO,
			timezone: schedule?.timezone as string,
			scope: initialValues.scope || '',
		};
	}, [initialValues, isEditMode, alertOptions]);

	useEffect(() => {
		setSelectedTags(formattedInitialValues.alertRules);
		setAlertRuleScope(formattedInitialValues.alertRuleScope);
		form.setFieldsValue({ ...formattedInitialValues });
	}, [form, formattedInitialValues, initialValues]);

	const { startTimeText, endTimeText } = useScheduleInfoText(
		formData,
		recurrenceType,
	);
	const formName = isEditMode ? 'edit-form' : 'create-form';

	const hint = (text: string): ReactNode =>
		isEmpty(text) ? undefined : <span className="tw:text-xs">{text}</span>;

	return (
		<FormSheet
			open={isOpen}
			onClose={handleCancel}
			title={isEditMode ? 'Edit planned downtime' : 'New planned downtime'}
			description="Silence alerts for a one-off or recurring window."
			testId="planned-downtime-form-sheet"
			footer={
				<>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button
						type="submit"
						form={formName}
						onClick={handleOk}
						disabled={saveLoading || isLoading}
						aria-busy={saveLoading || isLoading}
						className="downtime-schedule-btn"
					>
						{saveLoading || isLoading ? (
							<Loader2 aria-hidden="true" className="tw:animate-spin" />
						) : (
							<Check aria-hidden="true" />
						)}
						<span className="translate-safe">
							{isEditMode ? 'Update downtime schedule' : 'Add downtime schedule'}
						</span>
					</Button>
				</>
			}
		>
			<Form<PlannedDowntimeFormData>
				name={formName}
				form={form}
				layout="vertical"
				onFinish={onFinish}
				onValuesChange={(): void => {
					setRecurrenceType(form.getFieldValue('recurrence')?.repeatType as string);
					setAlertRuleScope(form.getFieldValue('alertRuleScope') as AlertRuleScope);
					handleFormData(form.getFieldsValue());
				}}
				autoComplete="off"
			>
				<Form.Item label="Name" name="name" rules={requiredFieldRule}>
					<Input placeholder="e.g. Upgrade downtime" />
				</Form.Item>
				<Form.Item
					label="Starts from"
					name="startTime"
					rules={requiredFieldRule}
					extra={hint(startTimeText)}
				>
					<DatePicker
						format={(date) => date.format(customFormat)}
						showTime
						renderExtraFooter={datePickerFooter}
						showNow={false}
						className="tw:w-full"
					/>
				</Form.Item>
				<DowntimeRecurrenceFields
					recurrenceType={recurrenceType}
					durationUnit={durationUnit}
					onDurationUnitChange={setDurationUnit}
				/>
				<Form.Item label="Timezone" name="timezone" rules={requiredFieldRule}>
					<Select options={TZ_OPTIONS} placeholder="Select timezone" showSearch />
				</Form.Item>
				<Form.Item
					label="Ends on"
					name="endTime"
					required={recurrenceType === recurrenceOptions.doesNotRepeat.value}
					rules={[
						{
							required: recurrenceType === recurrenceOptions.doesNotRepeat.value,
						},
					]}
					extra={hint(endTimeText)}
				>
					<DatePicker
						format={(date) => date.format(customFormat)}
						showTime
						showNow={false}
						renderExtraFooter={datePickerFooter}
						className="tw:w-full"
					/>
				</Form.Item>
				<DowntimeAlertRulesField
					alertRuleScope={alertRuleScope}
					onScopeChange={setAlertRuleScope}
					selectedTags={selectedTags}
					onRulesChange={handleAlertRulesChange}
					onRemoveRule={handleClose}
					alertOptions={alertOptions}
					isError={isError}
					isLoading={isLoading}
				/>
				<DowntimeScopeField />
			</Form>
		</FormSheet>
	);
}
