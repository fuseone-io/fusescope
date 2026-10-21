import { useEffect } from 'react';
import ChartPointPopover from 'components/ChartPointPopover/ChartPointPopover';
import { PrecisionOption } from 'components/Graph/types';
import { useTimezone } from 'providers/Timezone';
import uPlot from 'uplot';

import { OpenPanelPoint } from '../pointMenu.types';
import { formatPointValue, getPointAnchor } from './pointPopoverUtils';

interface PanelPointPopoverProps {
	openPoint: OpenPanelPoint;
	yAxisUnit?: string;
	decimalPrecision?: PrecisionOption;
	plot: uPlot | null;
	/** The positioned element the plot is drawn in. */
	container: HTMLElement | null;
	onClose: () => void;
}

function PanelPointPopover({
	openPoint: { point, content },
	yAxisUnit,
	decimalPrecision,
	plot,
	container,
	onClose,
}: PanelPointPopoverProps): JSX.Element {
	const { timezone, formatTimezoneAdjustedTimestamp } = useTimezone();

	// The hover tooltip would sit over the menu: end the hover and pause it.
	useEffect(() => {
		const over = plot?.over;
		if (!over) {
			return undefined;
		}
		over.dispatchEvent(new MouseEvent('mouseleave'));
		over.style.pointerEvents = 'none';
		return (): void => {
			over.style.pointerEvents = '';
		};
	}, [plot]);

	const time = `${formatTimezoneAdjustedTimestamp(
		point.timestamp * 1000,
		'HH:mm:ss',
	)} ${timezone.offset}`;

	return (
		<ChartPointPopover
			anchor={getPointAnchor(plot, container, point.timestamp)}
			time={time}
			value={formatPointValue(point, yAxisUnit, decimalPrecision)}
			actions={content.actions}
			context={content.context}
			onClose={onClose}
			boundary={container}
			returnFocusTo={container}
		/>
	);
}

export default PanelPointPopover;
