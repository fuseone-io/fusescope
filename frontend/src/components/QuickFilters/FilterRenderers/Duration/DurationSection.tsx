import {
	ChangeEventHandler,
	Dispatch,
	SetStateAction,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
} from 'react';
import { Slider } from '@signozhq/ui/slider';
import { Input } from 'components/ui/input';
import { getMs } from 'utils/timeUtils';
import useDebouncedFn from 'hooks/useDebouncedFunction';

import { traceFilterKeys } from 'constants/traceFilterKeys';

import { addFilter, FilterType } from './utils';

interface DurationProps {
	selectedFilters: FilterType | undefined;
	setSelectedFilters: Dispatch<SetStateAction<FilterType | undefined>>;
}

export function DurationSection(props: DurationProps): JSX.Element {
	const { setSelectedFilters, selectedFilters } = props;

	const getDuration = useMemo(() => {
		if (selectedFilters?.durationNanoMin || selectedFilters?.durationNanoMax) {
			return {
				minDuration: selectedFilters?.durationNanoMin?.values || '',
				maxDuration: selectedFilters?.durationNanoMax?.values || '',
			};
		}

		if (selectedFilters?.durationNano) {
			return {
				minDuration: getMs(selectedFilters?.durationNano?.values?.[0] || ''),
				maxDuration: getMs(selectedFilters?.durationNano?.values?.[1] || ''),
			};
		}

		return {
			maxDuration: '',
			minDuration: '',
		};
	}, [selectedFilters]);

	const inputId = useId();
	const [preMax, setPreMax] = useState<string>('');
	const [preMin, setPreMin] = useState<string>('');

	useEffect(() => {
		setPreMax(getDuration.maxDuration as string);
		setPreMin(getDuration.minDuration as string);
	}, [getDuration]);

	const updateDurationFilter = (min: string, max: string): void => {
		const durationMin = 'durationNanoMin';
		const durationMax = 'durationNanoMax';

		addFilter(durationMin, min, setSelectedFilters, traceFilterKeys.durationNano);
		addFilter(durationMax, max, setSelectedFilters, traceFilterKeys.durationNano);
	};

	const onRangeSliderHandler = (number: [string, string]): void => {
		const [min, max] = number;

		setPreMin(min);
		setPreMax(max);
	};

	const debouncedFunction = useDebouncedFn((min, max) => {
		updateDurationFilter(min as string, max as string);
	}, 1500);

	const onChangeMaxHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
		const { value } = event.target;
		const min = preMin;
		const max = value;

		onRangeSliderHandler([min, max]);
		debouncedFunction(min, max);
	};

	const onChangeMinHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
		const { value } = event.target;
		const min = value;
		const max = preMax;

		onRangeSliderHandler([min, max]);
		debouncedFunction(min, max);
	};

	const onRangeHandler = (value: number | number[]): void => {
		const [min, max] = value as number[];
		updateDurationFilter(min.toString(), max.toString());
	};

	const TipComponent = useCallback(
		(value: number) => <div>{`${value.toString()}ms`}</div>,
		[],
	);

	return (
		<div>
			<div className="duration-inputs fs-ui">
				<label className="duration-input-label" htmlFor={`${inputId}-min`}>
					Min (ms)
					<Input
						id={`${inputId}-min`}
						type="number"
						placeholder="0"
						className="duration-input"
						onChange={onChangeMinHandler}
						value={preMin}
						data-testid="min-input"
					/>
				</label>
				<label className="duration-input-label" htmlFor={`${inputId}-max`}>
					Max (ms)
					<Input
						id={`${inputId}-max`}
						type="number"
						placeholder="Any"
						className="duration-input"
						onChange={onChangeMaxHandler}
						value={preMax}
						data-testid="max-input"
					/>
				</label>
			</div>
			<div className="duration-input-slider">
				<Slider
					min={0}
					max={100000}
					range
					tooltip={{ formatter: TipComponent }}
					onChange={(value): void => {
						const [min, max] = value as number[];
						onRangeSliderHandler([String(min), String(max)]);
					}}
					onAfterChange={onRangeHandler}
					value={[Number(preMin), Number(preMax)]}
				/>
			</div>
		</div>
	);
}
