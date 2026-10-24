import {
	ChangeEvent,
	Dispatch,
	SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Input } from 'components/ui/input';
import { NativeSelect, NativeSelectOption } from 'components/ui/native-select';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { find } from 'lodash-es';
import { Info } from 'lucide-react';
import { TTTLType } from 'types/api/settings/common';

import {
	convertHoursValueToRelevantUnit,
	SettingPeriod,
	TimeUnits,
	TimeUnitsValues,
} from './utils';

function Retention({
	type,
	retentionValue,
	setRetentionValue,
	text,
	disabled = false,
	info,
	field,
	isS3Field = false,
}: RetentionProps): JSX.Element | null {
	// Filter available units based on type and field
	const availableUnits = useMemo(
		() =>
			TimeUnits.filter((option) => {
				if (type === 'logs') {
					// For S3 cold storage fields: only allow Days
					if (isS3Field) {
						return option.value === TimeUnitsValues.day;
					}
					// For total retention: allow Days and Months (not Hours)
					return option.value !== TimeUnitsValues.hr;
				}
				return true;
			}),
		[type, isS3Field],
	);

	// Convert the hours value using only the available units
	const { value: initialValue, timeUnitValue: initialTimeUnitValue } =
		convertHoursValueToRelevantUnit(Number(retentionValue), availableUnits);

	const [selectedTimeUnit, setSelectTimeUnit] = useState(initialTimeUnitValue);
	const [selectedValue, setSelectedValue] = useState<number | null>(
		initialValue,
	);
	const interacted = useRef(false);

	const { isCloudUser: isCloudUserVal } = useGetTenantLicense();

	useEffect(() => {
		if (!interacted.current) {
			setSelectedValue(initialValue);
		}
	}, [initialValue]);

	useEffect(() => {
		if (!interacted.current) {
			setSelectTimeUnit(initialTimeUnitValue);
		}
	}, [initialTimeUnitValue]);

	const currentSelectedOption = (option: SettingPeriod): void => {
		const selectedValue = find(availableUnits, (e) => e.value === option)?.value;
		if (selectedValue) {
			setSelectTimeUnit(selectedValue);
		}
	};

	useEffect(() => {
		const inverseMultiplier = find(
			availableUnits,
			(timeUnit) => timeUnit.value === selectedTimeUnit,
		)?.multiplier;
		if (!selectedValue) {
			setRetentionValue(null);
		}
		if (selectedValue && inverseMultiplier) {
			setRetentionValue(selectedValue * (1 / inverseMultiplier));
		}
	}, [selectedTimeUnit, selectedValue, setRetentionValue, availableUnits]);

	const onChangeHandler = (
		e: ChangeEvent<HTMLInputElement>,
		func: Dispatch<SetStateAction<number | null>>,
	): void => {
		interacted.current = true;
		const { value } = e.target;
		const integerValue = parseInt(value, 10);

		if (value.length > 0 && integerValue.toString() === value) {
			const parsedValue = Math.abs(integerValue);
			func(parsedValue);
		}

		if (value.length === 0) {
			func(null);
		}
	};

	const isDisabled = isCloudUserVal || disabled;

	return (
		<div className="retention-input-group tw:flex tw:flex-col tw:gap-1">
			<span
				title={text}
				className="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-muted-foreground"
			>
				{text.split('\n')[0]}
				{info && (
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger
								type="button"
								aria-label={info}
								data-testid={`retention-${type}-${field}-info`}
								className="tw:inline-flex tw:cursor-help tw:border-0 tw:bg-transparent tw:p-0 tw:text-muted-foreground tw:hover:text-foreground tw:[&_svg]:size-3.5"
							>
								<Info />
							</TooltipTrigger>
							<TooltipContent>{info}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</span>
			<div className="tw:flex">
				<Input
					type="number"
					min={0}
					aria-label={`${type} ${text}`}
					data-testid={`retention-${type}-${field}-input`}
					value={
						!disabled && selectedValue && selectedValue >= 0 ? selectedValue : ''
					}
					disabled={isDisabled}
					onChange={(e): void => onChangeHandler(e, setSelectedValue)}
					className="tw:w-24 tw:rounded-r-none tw:tabular-nums tw:[appearance:textfield] tw:[&::-webkit-inner-spin-button]:appearance-none tw:[&::-webkit-outer-spin-button]:appearance-none"
				/>
				<NativeSelect
					aria-label={`${type} ${text} unit`}
					data-testid={`retention-${type}-${field}-unit`}
					value={selectedTimeUnit}
					onChange={(e): void =>
						currentSelectedOption(e.target.value as SettingPeriod)
					}
					disabled={isDisabled}
					className="tw:w-28 tw:-ml-px tw:rounded-l-none"
				>
					{availableUnits.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.key}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</div>
		</div>
	);
}

interface RetentionProps {
	type: TTTLType;
	retentionValue: number | null;
	text: string;
	setRetentionValue: Dispatch<SetStateAction<number | null>>;
	disabled?: boolean;
	/** Shown in a tooltip next to the label. */
	info?: string;
	/** Names the input and unit test ids. */
	field: 'total' | 's3';
	isS3Field?: boolean;
}

Retention.defaultProps = {
	isS3Field: false,
	disabled: false,
	info: undefined,
};
export default Retention;
