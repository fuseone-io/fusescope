import { initialQueriesMap } from 'constants/queryBuilder';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { Query } from 'types/api/queryBuilder/queryBuilderData';

import { withErrorSeverity } from '../Tabs/util';

const serviceLogs: Query = {
	...initialQueriesMap.logs,
	builder: {
		...initialQueriesMap.logs.builder,
		queryData: [
			{
				...initialQueriesMap.logs.builder.queryData[0],
				filters: {
					op: 'AND',
					items: [
						{
							id: 'svc',
							key: {
								key: 'service.name',
								dataType: DataTypes.String,
								type: 'resource',
							},
							op: '=',
							value: 'payment',
						},
					],
				},
			},
		],
	},
};

describe('withErrorSeverity', () => {
	const expression = (): string =>
		withErrorSeverity(serviceLogs).builder.queryData[0].filter?.expression ?? '';

	it('keeps the service filter', () => {
		expect(expression()).toContain("service.name = 'payment'");
	});

	it('matches ERROR and FATAL by severity_number, whatever the text says', () => {
		expect(expression()).toContain(
			'severity_number IN [17, 18, 19, 20, 21, 22, 23, 24]',
		);
		expect(expression()).not.toContain('severity_text IN');
	});

	it('falls back to the text, in any case, for logs without a number', () => {
		const fallback =
			/\(severity_number = 0 AND severity_text REGEXP '([^']*)'\)/.exec(
				expression(),
			);
		expect(fallback).not.toBeNull();
		const textPattern = new RegExp(
			(fallback?.[1] ?? '').replace('(?i)', ''),
			'i',
		);
		['Error', 'ERROR', 'err', 'Fatal', 'critical', 'emerg'].forEach((text) =>
			expect(text).toMatch(textPattern),
		);
		['Info', 'WARN', 'debug'].forEach((text) =>
			expect(text).not.toMatch(textPattern),
		);
	});
});
