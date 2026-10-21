import {
	FieldContext,
	type ConditionKey,
	type DraftGroup,
	type DraftMapper,
	MapperOrigin,
} from '../types';
import {
	mappingCountLabel,
	summarizeConditions,
	summarizeDraftChanges,
} from '../summaries';

const key = (value: string): ConditionKey => ({
	value,
	enabled: true,
	origin: MapperOrigin.user,
});

const mapper = (localId: string, name = localId): DraftMapper => ({
	localId,
	serverId: localId,
	name,
	fieldContext: FieldContext.attribute,
	sources: [],
	enabled: true,
});

const group = (
	localId: string,
	overrides: Partial<DraftGroup> = {},
): DraftGroup => ({
	localId,
	serverId: localId,
	name: localId,
	attributes: [],
	resource: [],
	enabled: true,
	mappers: [],
	...overrides,
});

describe('summarizeConditions', () => {
	it.each<[string, ConditionKey[], ConditionKey[], string]>([
		['no keys', [], [], 'No conditions'],
		[
			'attribute keys',
			[key('model'), key('llm.input_messages')],
			[],
			'Runs when an attribute key contains model, llm.input_messages',
		],
		[
			'resource keys',
			[],
			[key('cloud.account.id')],
			'Runs when a resource key contains cloud.account.id',
		],
		[
			'both kinds',
			[key('ai.embeddings')],
			[key('cloud.account.id')],
			'Runs when an attribute or resource key contains ai.embeddings, cloud.account.id',
		],
		[
			'more than three keys',
			[key('a'), key('b'), key('c'), key('d'), key('e')],
			[],
			'Runs when an attribute key contains a, b, c +2 more',
		],
	])('describes %s', (_name, attributes, resource, expected) => {
		expect(summarizeConditions(attributes, resource)).toBe(expected);
	});
});

describe('mappingCountLabel', () => {
	it.each<[string, DraftGroup, string | null]>([
		['loaded mappings', group('g', { mappers: [mapper('m1')] }), '1 mapping'],
		[
			'several mappings',
			group('g', { mappers: [mapper('m1'), mapper('m2')] }),
			'2 mappings',
		],
		['an unsaved empty group', group('g', { serverId: null }), '0 mappings'],
		['a saved group whose mappings are not loaded', group('g'), null],
	])('labels %s', (_name, input, expected) => {
		expect(mappingCountLabel(input)).toBe(expected);
	});
});

describe('summarizeDraftChanges', () => {
	const llm = group('llm', { mappers: [mapper('m1'), mapper('m2')] });
	const tool = group('tool');

	it.each<[string, DraftGroup[], string | null]>([
		['no change', [llm, tool], null],
		[
			'one mapping toggled',
			[
				{ ...llm, mappers: [{ ...mapper('m1'), enabled: false }, mapper('m2')] },
				tool,
			],
			'1 mapping changed in llm',
		],
		[
			'a mapping added and one removed',
			[{ ...llm, mappers: [mapper('m1'), mapper('m3')] }, tool],
			'2 mappings changed in llm',
		],
		[
			'mappings changed in two groups',
			[
				{ ...llm, mappers: [mapper('m1')] },
				{ ...tool, mappers: [{ ...mapper('m9'), serverId: null }] },
			],
			'2 mappings changed in 2 groups',
		],
		['a group disabled', [{ ...llm, enabled: false }, tool], '1 group changed'],
		[
			'a group removed and one added',
			[llm, group('new', { serverId: null })],
			'2 groups changed',
		],
		[
			'a group renamed and a mapping changed',
			[
				{ ...llm, name: 'llm2', mappers: [mapper('m1')] },
				{ ...tool, attributes: [key('tool')] },
			],
			'2 groups and 1 mapping changed',
		],
	])('summarizes %s', (_name, draft, expected) => {
		expect(summarizeDraftChanges([llm, tool], draft)).toBe(expected);
	});
});
