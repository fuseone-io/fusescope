import { Button } from 'components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface RailToggleButtonProps {
	/** The filter rail is showing, so the button collapses it. */
	open: boolean;
	onToggle: () => void;
	openLabel?: string;
	closeLabel?: string;
	testId?: string;
}

/** Collapses a page's filter rail, or brings it back from the toolbar. */
function RailToggleButton({
	open,
	onToggle,
	openLabel = 'Show Filters',
	closeLabel = 'Collapse Filters',
	testId,
}: RailToggleButtonProps): JSX.Element {
	const label = open ? closeLabel : openLabel;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={open ? 'ghost' : 'outline'}
						size="icon-sm"
						aria-label={label}
						data-testid={testId}
						onClick={onToggle}
						className="fs-ui tw:flex-none tw:text-muted-foreground"
					>
						{open ? <PanelLeftClose /> : <PanelLeftOpen />}
					</Button>
				</TooltipTrigger>
				<TooltipContent side={open ? 'right' : 'bottom'}>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export default RailToggleButton;
