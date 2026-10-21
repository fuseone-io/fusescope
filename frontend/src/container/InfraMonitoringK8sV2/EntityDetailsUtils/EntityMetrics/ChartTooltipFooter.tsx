import { Button } from 'components/ui/button';
import { Kbd } from 'components/ui/kbd';
import { MousePointerClick, X } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { Events } from 'constants/events';
import { DEFAULT_PIN_TOOLTIP_KEY } from 'lib/uPlotV2/plugins/TooltipPlugin/types';

import styles from './ChartTooltipFooter.module.scss';

interface ChartTooltipFooterProps {
	id: string;
	pinKey?: string;
	isPinned: boolean;
	canSelectTimeRange?: boolean;
	dismiss: () => void;
}

export default function ChartTooltipFooter({
	id,
	pinKey = DEFAULT_PIN_TOOLTIP_KEY,
	isPinned,
	canSelectTimeRange = true,
	dismiss,
}: ChartTooltipFooterProps): JSX.Element {
	const handleUnpinClick = (): void => {
		void logEvent(Events.TOOLTIP_UNPINNED, {
			id,
		});
		dismiss();
	};

	return (
		<output className={styles.footer} data-testid="entity-chart-tooltip-footer">
			<div>
				{isPinned ? (
					<span className={styles.hint}>
						<span>Press</span>
						<Kbd className="tw:bg-primary-soft tw:text-primary-ink">
							{pinKey.toUpperCase()}
						</Kbd>
						<span>or</span>
						<Kbd className="tw:bg-primary-soft tw:text-primary-ink">Esc</Kbd>
						<span>to unpin</span>
					</span>
				) : (
					<div className={styles.hintList}>
						{canSelectTimeRange && (
							<span className={styles.hint} data-active="false">
								<Kbd>
									<MousePointerClick size={12} />
								</Kbd>
								<span>Click and drag to zoom into a time range</span>
							</span>
						)}
						<span className={styles.hint} data-active="false">
							<span>Press</span>
							<Kbd>{pinKey.toUpperCase()}</Kbd>
							<span>to pin the tooltip</span>
						</span>
					</div>
				)}
			</div>

			{isPinned && (
				<Button
					variant="outline"
					size="xs"
					onClick={handleUnpinClick}
					aria-label="Unpin tooltip"
					data-testid="entity-chart-tooltip-unpin"
				>
					<X />
					<span>Unpin</span>
				</Button>
			)}
		</output>
	);
}
