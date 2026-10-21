import type { StatusTone } from 'components/PageTemplate/types';
import { InframonitoringtypesNodeConditionDTO } from 'api/generated/services/fuseScope.schemas';

export const NODE_CONDITION_COLORS: Record<
	InframonitoringtypesNodeConditionDTO,
	StatusTone
> = {
	[InframonitoringtypesNodeConditionDTO.ready]: 'success',
	[InframonitoringtypesNodeConditionDTO.not_ready]: 'warning',
	[InframonitoringtypesNodeConditionDTO.no_data]: 'neutral',
};

export const NODE_CONDITION_LABELS: Record<
	InframonitoringtypesNodeConditionDTO,
	string
> = {
	[InframonitoringtypesNodeConditionDTO.ready]: 'Ready',
	[InframonitoringtypesNodeConditionDTO.not_ready]: 'Not Ready',
	[InframonitoringtypesNodeConditionDTO.no_data]: 'No Data',
};
