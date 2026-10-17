import { pipelineData } from 'container/PipelinePage/Layouts/ChangeHistory/tests/testUtils';
import { SuccessResponse } from 'types/api';
import { Pipeline } from 'types/api/pipeline/def';

import { pipelineRefetchInterval } from '../utils';

const responseWithLatestStatus = (
	deployStatus: string,
): SuccessResponse<Pipeline> => ({
	statusCode: 200,
	error: null,
	message: 'success',
	payload: {
		...pipelineData,
		history: [{ ...pipelineData.history[0], deployStatus }],
	},
});

describe('pipelineRefetchInterval', () => {
	it.each(['deployed', 'failed'])(
		'stops polling once the latest deployment is %s',
		(deployStatus) => {
			expect(pipelineRefetchInterval(responseWithLatestStatus(deployStatus))).toBe(
				false,
			);
		},
	);

	it.each(['in_progress', 'deploying', 'dirty', 'unknown'])(
		'polls while the latest deployment is %s',
		(deployStatus) => {
			expect(pipelineRefetchInterval(responseWithLatestStatus(deployStatus))).toBe(
				3000,
			);
		},
	);

	it('does not poll without a response', () => {
		expect(pipelineRefetchInterval(undefined)).toBe(false);
	});
});
