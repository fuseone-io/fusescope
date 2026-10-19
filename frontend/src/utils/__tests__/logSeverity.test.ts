import { normalizeSeverity } from '../logSeverity';

describe('normalizeSeverity', () => {
	it.each([
		[1, 'TRACE'],
		[4, 'TRACE'],
		[5, 'DEBUG'],
		[8, 'DEBUG'],
		[9, 'INFO'],
		[12, 'INFO'],
		[13, 'WARN'],
		[16, 'WARN'],
		[17, 'ERROR'],
		[20, 'ERROR'],
		[21, 'FATAL'],
		[24, 'FATAL'],
	])('reads severity_number %i as %s', (severityNumber, level) => {
		expect(normalizeSeverity(severityNumber, 'whatever')).toBe(level);
	});

	it.each([
		['trace', 'TRACE'],
		['Debug', 'DEBUG'],
		['dbg', 'DEBUG'],
		['INFO', 'INFO'],
		[' Information ', 'INFO'],
		['notice', 'INFO'],
		['Warn', 'WARN'],
		['WARNING', 'WARN'],
		['error', 'ERROR'],
		['ERR', 'ERROR'],
		['Fatal', 'FATAL'],
		['CRITICAL', 'FATAL'],
		['crit', 'FATAL'],
		['emerg', 'FATAL'],
		['Emergency', 'FATAL'],
		['alert', 'FATAL'],
		['panic', 'FATAL'],
	])('falls back to the text %p as %s without a number', (text, level) => {
		expect(normalizeSeverity(0, text)).toBe(level);
		expect(normalizeSeverity(undefined, text)).toBe(level);
	});

	it.each([
		[0, ''],
		[undefined, undefined],
		[0, 'verbose'],
		[25, 'mystery'],
	])('calls number %p with text %p unknown', (severityNumber, text) => {
		expect(normalizeSeverity(severityNumber, text)).toBe('UNKNOWN');
	});

	it('trusts the number over a contradicting text', () => {
		expect(normalizeSeverity(17, 'INFO')).toBe('ERROR');
	});
});
