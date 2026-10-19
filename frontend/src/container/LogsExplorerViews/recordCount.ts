import { Options } from 'container/TopNav/DateTimeSelectionV2/constants';
import { QueryData } from 'types/api/widgets/getQuery';

/** Total records across every bucket of the frequency chart's series. */
export function sumSeriesTotal(series: QueryData[]): number {
	return series.reduce(
		(total, item) =>
			total +
			item.values.reduce((sum, [, value]) => sum + (Number(value) || 0), 0),
		0,
	);
}

/** "in the last 30 minutes", or "between … and …" for a custom range. */
export function recordsTimePhrase(
	selectedTime: string,
	start: string,
	end: string,
): string {
	if (selectedTime === 'custom') {
		return `between ${start} and ${end}`;
	}
	const label = Options.find((option) => option.value === selectedTime)?.label;
	return label ? `in the ${label.toLowerCase()}` : `in the last ${selectedTime}`;
}
