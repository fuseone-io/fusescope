import { useMemo } from 'react';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { SpanV3 } from 'types/api/trace/getTraceV3';

import { useTraceStore } from '../stores/traceStore';
import { getColorLegend } from '../utils/colorLegend';

const MAX_VISIBLE_ITEMS = 8;

interface FlameGraphLegendProps {
	spans: SpanV3[];
}

function Swatch({ color }: { color: string }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="tw:size-2 tw:flex-none tw:rounded-[2px]"
			style={{ background: color }}
		/>
	);
}

/** Which colour stands for which colour-by group in the flame graph and waterfall. */
function FlameGraphLegend({
	spans,
}: FlameGraphLegendProps): JSX.Element | null {
	const colorByField = useTraceStore((s) => s.colorByField);
	const isDarkMode = useIsDarkMode();
	const legend = useMemo(
		() => getColorLegend(spans, colorByField.name),
		[spans, colorByField.name],
	);

	if (legend.items.length === 0) {
		return null;
	}

	const visible = legend.items.slice(0, MAX_VISIBLE_ITEMS);
	const hidden = legend.items.slice(MAX_VISIBLE_ITEMS);

	return (
		<ul
			aria-label={`Colour by ${colorByField.name}`}
			data-testid="flame-graph-legend"
			title={legend.items.map((item) => item.label).join(', ')}
			className="fs-ui tw:m-0 tw:flex tw:min-w-0 tw:list-none tw:flex-nowrap tw:items-center tw:justify-start tw:gap-x-3 tw:overflow-hidden tw:p-0 tw:font-sans tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground"
		>
			{visible.map((item) => (
				<li
					key={item.label}
					className="tw:inline-flex tw:flex-none tw:items-center tw:gap-1.5 tw:first:ms-auto"
				>
					<Swatch color={isDarkMode ? item.color : item.colorDark} />
					<span className="tw:font-mono">{item.label}</span>
				</li>
			))}
			{hidden.length > 0 && (
				<li className="tw:flex-none">+{hidden.length} more</li>
			)}
			{legend.hasErrors && (
				<li className="tw:inline-flex tw:flex-none tw:items-center tw:gap-1.5 tw:first:ms-auto">
					<Swatch color={legend.errorColor} />
					Error
				</li>
			)}
		</ul>
	);
}

export default FlameGraphLegend;
