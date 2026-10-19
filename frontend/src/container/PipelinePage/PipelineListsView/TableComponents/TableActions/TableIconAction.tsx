import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';

interface TableIconActionProps {
	label: string;
	onClick: VoidFunction;
	testId: string;
	children: ReactNode;
	small?: boolean;
	danger?: boolean;
}

/** A ghost icon button for a pipeline or processor row. */
function TableIconAction({
	label,
	onClick,
	testId,
	children,
	small = false,
	danger = false,
}: TableIconActionProps): JSX.Element {
	return (
		<span className="fs-ui tw:inline-flex">
			<Button
				variant="ghost"
				size={small ? 'icon-xs' : 'icon-sm'}
				aria-label={label}
				title={label}
				data-testid={testId}
				onClick={onClick}
				className={cn('tw:text-muted-foreground', danger && 'tw:hover:text-error')}
			>
				{children}
			</Button>
		</span>
	);
}

TableIconAction.defaultProps = {
	small: false,
	danger: false,
};

export default TableIconAction;
