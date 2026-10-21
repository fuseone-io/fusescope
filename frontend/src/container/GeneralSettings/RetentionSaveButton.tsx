import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from 'components/ui/tooltip';
import { Loader2 } from 'lucide-react';

interface RetentionSaveButtonProps {
	children: ReactNode;
	onClick: () => void;
	disabled: boolean;
	loading: boolean;
	disabledReason: string;
	testId: string;
}

function RetentionSaveButton({
	children,
	onClick,
	disabled,
	loading,
	disabledReason,
	testId,
}: RetentionSaveButtonProps): JSX.Element {
	const showReason = disabled && !loading && disabledReason !== '';

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="tw:inline-flex">
						<Button
							type="button"
							data-testid={testId}
							onClick={onClick}
							disabled={disabled || loading}
						>
							{loading && <Loader2 className="tw:animate-spin" aria-hidden="true" />}
							{children}
						</Button>
					</span>
				</TooltipTrigger>
				{showReason && <TooltipContent>{disabledReason}</TooltipContent>}
			</Tooltip>
		</TooltipProvider>
	);
}

export default RetentionSaveButton;
