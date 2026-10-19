import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLegendActions } from 'lib/uPlotV2/hooks/useLegendActions';
import useLegendsSync from 'lib/uPlotV2/hooks/useLegendsSync';
import { UPlotConfigBuilder } from 'lib/uPlotV2/config/UPlotConfigBuilder';

import FrequencyLegendItems from './FrequencyLegendItems';

interface FrequencyLegendProps {
	config: UPlotConfigBuilder;
	/** The panel header the legend renders into. */
	target: HTMLElement;
}

/** The chart's series legend, moved into the panel header; render inside the chart. */
function FrequencyLegend({
	config,
	target,
}: FrequencyLegendProps): JSX.Element {
	const { legendItemsMap } = useLegendsSync({ config });
	const onAction = useLegendActions();
	const items = useMemo(() => Object.values(legendItemsMap), [legendItemsMap]);

	return createPortal(
		<FrequencyLegendItems items={items} onAction={onAction} />,
		target,
	);
}

export default FrequencyLegend;
