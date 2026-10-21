import { Form, Input, Select } from 'antd';

import {
	recurrenceOptions,
	recurrenceOptionWithSubmenu,
	recurrenceWeeklyOptions,
} from './PlannedDowntimeutils';

const requiredFieldRule = [{ required: true }];

interface DowntimeRecurrenceFieldsProps {
	recurrenceType: string;
	durationUnit: string;
	onDurationUnitChange: (unit: string) => void;
}

/** How a downtime repeats: the cadence, the weekdays and each window's length. */
export function DowntimeRecurrenceFields({
	recurrenceType,
	durationUnit,
	onDurationUnitChange,
}: DowntimeRecurrenceFieldsProps): JSX.Element {
	return (
		<>
			<Form.Item
				label="Repeats every"
				name={['recurrence', 'repeatType']}
				rules={requiredFieldRule}
			>
				<Select
					placeholder="Select option..."
					options={recurrenceOptionWithSubmenu}
				/>
			</Form.Item>
			{recurrenceType === recurrenceOptions.weekly.value && (
				<Form.Item
					label="Weekly occurrence"
					name={['recurrence', 'repeatOn']}
					rules={requiredFieldRule}
				>
					<Select
						placeholder="Select option..."
						mode="multiple"
						options={Object.values(recurrenceWeeklyOptions)}
					/>
				</Form.Item>
			)}
			{recurrenceType &&
				recurrenceType !== recurrenceOptions.doesNotRepeat.value && (
					<Form.Item
						label="Duration"
						name={['recurrence', 'duration']}
						rules={requiredFieldRule}
					>
						<Input
							addonAfter={
								<Select
									defaultValue="m"
									value={durationUnit}
									onChange={onDurationUnitChange}
									style={{ width: 100 }}
								>
									<Select.Option value="m">Mins</Select.Option>
									<Select.Option value="h">Hours</Select.Option>
								</Select>
							}
							type="number"
							placeholder="Enter duration"
							min={1}
							onWheel={(e): void => e.currentTarget.blur()}
						/>
					</Form.Item>
				)}
		</>
	);
}
