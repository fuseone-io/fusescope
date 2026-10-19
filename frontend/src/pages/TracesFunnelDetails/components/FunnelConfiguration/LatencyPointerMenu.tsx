import { Button } from 'components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { LatencyPointers } from 'pages/TracesFunnelDetails/constants';
import { FLOATING_LAYER_CLASS } from 'pages/TracesFunnels/constants';
import { FunnelStepData } from 'types/api/traceFunnels';

type LatencyPointer = FunnelStepData['latency_pointer'];

interface LatencyPointerMenuProps {
	index: number;
	value: LatencyPointer;
	editable: boolean;
	onChange: (value: LatencyPointer) => void;
}

const TRIGGER =
	'tw:h-[26px] tw:gap-1 tw:px-1.5 tw:text-xs tw:font-medium tw:text-foreground';

function LatencyPointerMenu({
	index,
	value,
	editable,
	onChange,
}: LatencyPointerMenuProps): JSX.Element {
	const label = LatencyPointers.find((option) => option.value === value)?.key;

	if (!editable) {
		return (
			<span className={`tw:inline-flex tw:items-center ${TRIGGER}`}>
				{label}
				<ChevronDown aria-hidden="true" className="tw:size-3.5" />
			</span>
		);
	}

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid={`funnel-step-latency-pointer-${index}`}
					className={TRIGGER}
				>
					{label}
					<ChevronDown className="tw:size-3.5 tw:text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				aria-label="Latency pointer"
				className={`tw:min-w-[150px] ${FLOATING_LAYER_CLASS}`}
			>
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next): void => onChange(next as LatencyPointer)}
				>
					{LatencyPointers.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
							className="tw:text-[13px]"
						>
							{option.key}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default LatencyPointerMenu;
