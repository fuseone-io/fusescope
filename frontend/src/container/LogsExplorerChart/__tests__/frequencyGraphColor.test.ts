import { FsChartColor } from 'constants/fuseScopeColors';

import { getColorsForSeverityLabels, isRedLike } from '../utils';

describe('getColorsForSeverityLabels', () => {
	it('should return slate for blank labels', () => {
		expect(getColorsForSeverityLabels('', 0)).toBe(FsChartColor.BG_VANILLA_400);
		expect(getColorsForSeverityLabels('   ', 0)).toBe(
			FsChartColor.BG_VANILLA_400,
		);
	});

	it('paints severities with the FuseScope palette of the dark theme', () => {
		expect(getColorsForSeverityLabels('INFO', 0)).toBe('#3d8be0');
		expect(getColorsForSeverityLabels('ERROR', 0)).toBe('#dc2626');
		expect(getColorsForSeverityLabels('WARN', 0)).toBe('#d97706');
		expect(getColorsForSeverityLabels('DEBUG', 0)).toBe('#b8bfcc');
		expect(getColorsForSeverityLabels('TRACE', 0)).toBe('#8e98a8');
		expect(getColorsForSeverityLabels('FATAL', 0)).toBe('#c04fe0');
	});

	it('paints severities with the FuseScope palette of the light theme', () => {
		expect(getColorsForSeverityLabels('INFO', 0, false)).toBe('#0f5fb8');
		expect(getColorsForSeverityLabels('ERROR', 0, false)).toBe('#dc2626');
		expect(getColorsForSeverityLabels('WARN', 0, false)).toBe('#d97706');
		expect(getColorsForSeverityLabels('DEBUG', 0, false)).toBe('#4b5563');
		expect(getColorsForSeverityLabels('TRACE', 0, false)).toBe('#64707f');
		expect(getColorsForSeverityLabels('FATAL', 0, false)).toBe('#950fb8');
	});

	it('gives every spelling of a severity the same colour', () => {
		['Error', 'error', 'err', 'ERR', 'FAIL'].forEach((label) => {
			expect(getColorsForSeverityLabels(label, 0)).toBe('#dc2626');
		});
		['Warning', 'warning', 'wrn'].forEach((label) => {
			expect(getColorsForSeverityLabels(label, 0)).toBe('#d97706');
		});
	});

	it('should return non-red colors for unrecognized labels at any index', () => {
		for (let i = 0; i < 30; i++) {
			const color = getColorsForSeverityLabels('4', i);
			expect(isRedLike(color)).toBe(false);
		}
	});

	it('should return non-red colors for numeric severity text', () => {
		const numericLabels = ['1', '2', '4', '9', '13', '17', '21'];
		numericLabels.forEach((label) => {
			const color = getColorsForSeverityLabels(label, 0);
			expect(isRedLike(color)).toBe(false);
		});
	});
});
