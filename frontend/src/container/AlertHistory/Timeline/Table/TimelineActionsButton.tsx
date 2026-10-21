import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { Button } from 'components/ui/button';
import { EllipsisVertical } from 'lucide-react';

const TimelineActionsButton = forwardRef<
	HTMLButtonElement,
	ComponentPropsWithoutRef<'button'>
>(function TimelineActionsButton(props, ref): JSX.Element {
	return (
		<Button
			ref={ref}
			variant="ghost"
			size="icon-sm"
			aria-label="Row actions"
			data-testid="timeline-row-actions"
			{...props}
		>
			<EllipsisVertical aria-hidden="true" />
		</Button>
	);
});

export default TimelineActionsButton;
