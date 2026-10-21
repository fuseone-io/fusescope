// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import {
	TelemetrytypesFieldContextDTO,
	TelemetrytypesSignalDTO,
} from 'api/generated/services/fuseScope.schemas';
import { useGetFieldsValues } from 'api/generated/services/fields';
import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { NANO_SECOND_MULTIPLIER } from 'store/globalTime';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

const ALL = '__all__';

interface FilterValueMenuProps {
	label: string;
	/** Resource attribute the menu narrows, e.g. `service.name`. */
	attributeKey: string;
	allLabel: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	testId: string;
}

/** A labelled field that narrows the list to one value of a resource attribute. */
function FilterValueMenu({
	label,
	attributeKey,
	allLabel,
	value,
	onChange,
	testId,
}: FilterValueMenuProps): JSX.Element {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { data, isLoading } = useGetFieldsValues({
		signal: TelemetrytypesSignalDTO.traces,
		fieldContext: TelemetrytypesFieldContextDTO.resource,
		name: attributeKey,
		startUnixMilli: Math.floor(minTime / NANO_SECOND_MULTIPLIER),
		endUnixMilli: Math.floor(maxTime / NANO_SECOND_MULTIPLIER),
	});
	const values = data?.data?.values?.stringValues ?? [];
	const options = value && !values.includes(value) ? [value, ...values] : values;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					data-testid={testId}
					aria-label={label}
					className="tw:h-9 tw:max-w-64 tw:justify-between tw:rounded-lg tw:border-input tw:bg-surface-raised tw:px-3 tw:font-sans tw:font-normal tw:shadow-xs tw:dark:bg-surface-raised"
				>
					<span className="tw:text-xs tw:text-subtle-foreground">{label}</span>
					<span className="tw:truncate tw:text-[13px] tw:font-medium">
						{value ?? allLabel}
					</span>
					<ChevronDown aria-hidden="true" className="tw:text-subtle-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="tw:max-h-80 tw:min-w-48">
				<DropdownMenuRadioGroup
					value={value ?? ALL}
					onValueChange={(next): void => onChange(next === ALL ? undefined : next)}
				>
					<DropdownMenuRadioItem value={ALL}>{allLabel}</DropdownMenuRadioItem>
					{(options.length > 0 || isLoading) && <DropdownMenuSeparator />}
					{isLoading && (
						<div className="tw:px-2 tw:py-1.5 tw:text-xs tw:text-muted-foreground">
							Loading…
						</div>
					)}
					{options.map((option) => (
						<DropdownMenuRadioItem
							key={option}
							value={option}
							className="tw:font-mono tw:text-xs"
						>
							{option}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default FilterValueMenu;
