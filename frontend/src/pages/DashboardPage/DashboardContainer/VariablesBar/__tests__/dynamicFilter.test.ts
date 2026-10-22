import {
	emptyVariableFormModel,
	type VariableFormModel,
} from '../../DashboardSettings/Variables/variableFormModel';
import { buildExistingDynamicVariableQuery } from '../utils/dynamicFilter';

const dynamicVariable = (
	name: string,
	attribute: string,
): VariableFormModel => ({
	...emptyVariableFormModel(),
	name,
	type: 'DYNAMIC',
	dynamicAttribute: attribute,
});

describe('buildExistingDynamicVariableQuery', () => {
	it('escapes backslashes before quotes in selected values', () => {
		const query = buildExistingDynamicVariableQuery(
			[
				dynamicVariable('path', 'file.path'),
				dynamicVariable('current', 'host.name'),
			],
			{ path: { value: ['C:\\logs\\', "it's"], allSelected: false } },
			'current',
		);

		expect(query).toBe("file.path IN ['C:\\\\logs\\\\', 'it\\'s']");
	});
});
