import { CircleX, TriangleAlert } from '@signozhq/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@signozhq/ui/popover';

import PanelStatusContent from './PanelStatusContent';
import type { PanelStatusDetail, PanelStatusVariant } from './types';
import styles from './PanelStatusPopover.module.scss';

const VARIANT_CONFIG: Record<
	PanelStatusVariant,
	{ color: string; ariaLabel: string }
> = {
	error: { color: 'var(--fs-error)', ariaLabel: 'Panel error' },
	warning: { color: 'var(--fs-warning)', ariaLabel: 'Panel warning' },
};

interface PanelStatusPopoverProps {
	variant: PanelStatusVariant;
	detail: PanelStatusDetail;
	/** Overrides the trigger's test id; defaults to `panel-status-<variant>`. */
	testId?: string;
}

/**
 * Header status indicator: an icon that opens a popover with the status detail.
 * One component drives both variants so error and warning stay in lockstep.
 * A popover, not a tooltip: the detail is a card drawn with the page theme's
 * colors, with a list that scrolls, and a tooltip's surface is inverted by
 * design, which read light on light in the dark theme.
 */
function PanelStatusPopover({
	variant,
	detail,
	testId,
}: PanelStatusPopoverProps): JSX.Element {
	const { color, ariaLabel } = VARIANT_CONFIG[variant];
	const Icon = variant === 'error' ? CircleX : TriangleAlert;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={styles.trigger}
					aria-label={ariaLabel}
					data-testid={testId ?? `panel-status-${variant}`}
				>
					<Icon size={16} color={color} />
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className={styles.popover}>
				<PanelStatusContent variant={variant} detail={detail} />
			</PopoverContent>
		</Popover>
	);
}

export default PanelStatusPopover;
