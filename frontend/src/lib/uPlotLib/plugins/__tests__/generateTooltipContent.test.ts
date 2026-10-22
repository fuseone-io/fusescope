import { generateTooltipContent } from '../tooltipPlugin';

const renderRows = (labels: string[]): string[] => {
	const seriesList = labels.map((legend) => ({
		metric: {},
		queryName: 'A',
		legend,
		values: [],
	}));
	const series = [{}, ...labels.map((label) => ({ label, show: true }))];
	const data = [[1761148800], ...labels.map((_, index) => [index + 1])];

	const container = generateTooltipContent(
		seriesList,
		data,
		0,
		false,
		undefined,
		undefined,
		series,
	);

	return Array.from(container.querySelectorAll('.tooltip-data-point')).map(
		(row) => row.textContent ?? '',
	);
};

describe('generateTooltipContent', () => {
	it('renders series named after Object.prototype members as their own rows', () => {
		const rows = renderRows(['toString', '__proto__', 'constructor']);

		expect(rows).toHaveLength(3);
		expect(rows).toStrictEqual(
			expect.arrayContaining([
				expect.stringMatching(/^toString : /),
				expect.stringMatching(/^__proto__ : /),
				expect.stringMatching(/^constructor : /),
			]),
		);
	});

	it('prefixes duplicated labels with their query name', () => {
		expect(renderRows(['api', 'api'])).toStrictEqual(
			expect.arrayContaining([expect.stringMatching(/^A: api : /)]),
		);
	});
});
