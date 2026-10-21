import { useCallback, useRef, useState } from 'react';
import uPlot from 'uplot';

interface SeriesVisibility {
	/** Pass to the chart's `plotRef`. */
	plotRef: (plot: uPlot | null) => void;
	hidden: ReadonlySet<string>;
	/** Shows or hides the series with this label. */
	toggle: (label: string) => void;
}

/** Series visibility for a uPlot chart whose legend lives outside it. */
export function useSeriesVisibility(): SeriesVisibility {
	const plot = useRef<uPlot | null>(null);
	const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

	const plotRef = useCallback((instance: uPlot | null): void => {
		plot.current = instance;
		if (instance) {
			setHidden(
				new Set(
					instance.series
						.slice(1)
						.filter((series) => series.show === false)
						.map((series) => String(series.label ?? '')),
				),
			);
		}
	}, []);

	const toggle = useCallback((label: string): void => {
		const instance = plot.current;
		if (!instance) {
			return;
		}
		const index = instance.series.findIndex(
			(series, position) => position > 0 && String(series.label) === label,
		);
		if (index < 0) {
			return;
		}
		const show = instance.series[index].show === false;
		instance.setSeries(index, { show });
		setHidden((current) => {
			const next = new Set(current);
			if (show) {
				next.delete(label);
			} else {
				next.add(label);
			}
			return next;
		});
	}, []);

	return { plotRef, hidden, toggle };
}
