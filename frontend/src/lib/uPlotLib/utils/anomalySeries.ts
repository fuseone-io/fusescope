export interface AnomalySeriesPoint {
	timestamp: number;
	value: number | string | null;
}

export interface AnomalySeries {
	labels?: Record<string, unknown>;
	values?: AnomalySeriesPoint[];
}

// seriesLabelsKey identifies a label set: sorted [name, value] pairs as JSON, so the order
// does not matter, separators inside values cannot collide and 1 differs from "1".
export const seriesLabelsKey = (
	labels: Record<string, unknown> | undefined,
): string =>
	JSON.stringify(
		Object.entries(labels ?? {}).sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		),
	);

export const indexByLabels = (
	series: AnomalySeries[] | undefined,
): Map<string, AnomalySeries> => {
	const index = new Map<string, AnomalySeries>();
	(series ?? []).forEach((entry) => {
		const key = seriesLabelsKey(entry.labels);
		if (!index.has(key)) {
			index.set(key, entry);
		}
	});
	return index;
};

// toChartValue reads a point's value as a number; the v5 conversion carries them as strings.
export const toChartValue = (
	value: number | string | null | undefined,
): number | null => {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
};

// valuesAt projects a band's points onto the series timestamps, null where the band has none.
export const valuesAt = (
	timestamps: number[],
	band: AnomalySeries | undefined,
): (number | null)[] => {
	const byTimestamp = new Map<number, number | null>();
	(band?.values ?? []).forEach((point) => {
		byTimestamp.set(point.timestamp, toChartValue(point.value));
	});
	return timestamps.map((timestamp) => byTimestamp.get(timestamp) ?? null);
};
