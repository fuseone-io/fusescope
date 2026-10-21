import type { SpantypesSpanMapperDTO } from 'api/generated/services/fuseScope.schemas';
import {
	SpantypesFieldContextDTO,
	SpantypesSpanMapperOperationDTO,
	SpantypesSpanMapperOriginDTO,
} from 'api/generated/services/fuseScope.schemas';
import { rest } from 'msw';

const SEEDS: { name: string; sources: string[]; move?: boolean }[] = [
	{
		name: 'gen_ai.request.model',
		sources: ['gen_ai.request.model', 'llm.model_name', 'ai.model.id', 'model'],
	},
	{
		name: 'gen_ai.usage.input_tokens',
		sources: ['gen_ai.usage.input_tokens', 'llm.token_count.prompt'],
	},
	{
		name: 'gen_ai.usage.output_tokens',
		sources: ['gen_ai.usage.output_tokens', 'llm.token_count.completion'],
	},
	{ name: 'gen_ai.input.messages', sources: ['input.value'], move: true },
];

const mapper = (
	groupId: string,
	seed: (typeof SEEDS)[number],
	index: number,
): SpantypesSpanMapperDTO => ({
	id: `${groupId}-mapper-${index + 1}`,
	groupId,
	name: seed.name,
	enabled: true,
	origin: SpantypesSpanMapperOriginDTO.user,
	fieldContext: SpantypesFieldContextDTO.attribute,
	config: {
		sources: seed.sources.map((key, priority) => ({
			key,
			context: SpantypesFieldContextDTO.attribute,
			operation: seed.move
				? SpantypesSpanMapperOperationDTO.move
				: SpantypesSpanMapperOperationDTO.copy,
			priority: seed.sources.length - priority,
			enabled: true,
			origin: SpantypesSpanMapperOriginDTO.user,
		})),
	},
});

/** Every group answers with the same four mappings. */
export const spanMappersHandler = rest.get(
	'http://localhost/api/v1/span_mapper_groups/:groupId/span_mappers',
	(req, res, ctx) => {
		const groupId = String(req.params.groupId);
		return res(
			ctx.status(200),
			ctx.json({
				status: 'success',
				data: { items: SEEDS.map((seed, index) => mapper(groupId, seed, index)) },
			}),
		);
	},
);
