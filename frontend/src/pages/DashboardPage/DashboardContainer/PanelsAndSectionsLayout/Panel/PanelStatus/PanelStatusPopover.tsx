import { CircleX, TriangleAlert } from '@signozhq/icons';
import { Tooltip } from '@signozhq/ui/tooltip';

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
 * Header status indicator: an icon that opens a tooltip with the status detail.
 * One component drives both variants so error and warning stay in lockstep.
 */
function PanelStatusPopover({
	variant,
	detail,
	testId,
}: PanelStatusPopoverProps): JSX.Element {
	const { color, ariaLabel } = VARIANT_CONFIG[variant];
	const Icon = variant === 'error' ? CircleX : TriangleAlert;

	return (
		<Tooltip
			title={<PanelStatusContent variant={variant} detail={detail} />}
			side="top"
			align="end"
		>
			<span
				className={styles.trigger}
				aria-label={ariaLabel}
				data-testid={testId ?? `panel-status-${variant}`}
			>
				<Icon size={16} color={color} />
			</span>
		</Tooltip>
	);
}

export default PanelStatusPopover;
