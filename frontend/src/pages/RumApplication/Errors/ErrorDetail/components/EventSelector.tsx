import { Button } from 'components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface EventSelectorProps {
	/** 0 for the newest. */
	index: number;
	count: number;
	newer?: string;
	older?: string;
	onSelect: (eventId: string) => void;
}

/** Steps through the group's latest events, newest first. */
function EventSelector({
	index,
	count,
	newer,
	older,
	onSelect,
}: EventSelectorProps): JSX.Element {
	return (
		<span className="tw:inline-flex tw:items-center tw:gap-1">
			<Button
				variant="outline"
				size="icon-sm"
				aria-label="Older event"
				data-testid="rum-error-event-older"
				disabled={!older}
				onClick={(): void => {
					if (older) {
						onSelect(older);
					}
				}}
			>
				<ChevronLeft />
			</Button>
			<span
				data-testid="rum-error-event-position"
				className="tw:px-1 tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums"
			>
				Event {index + 1} of {count} latest
			</span>
			<Button
				variant="outline"
				size="icon-sm"
				aria-label="Newer event"
				data-testid="rum-error-event-newer"
				disabled={!newer}
				onClick={(): void => {
					if (newer) {
						onSelect(newer);
					}
				}}
			>
				<ChevronRight />
			</Button>
		</span>
	);
}

export default EventSelector;
