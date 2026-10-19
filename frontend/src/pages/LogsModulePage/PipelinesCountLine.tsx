import { useQuery } from 'react-query';
import { SuccessResponse } from 'types/api';
import { Pipeline } from 'types/api/pipeline/def';

// The pipelines tab's own query; disabled here, so this only reads its cache.
const PIPELINES_QUERY_KEY = ['version', 'latest', 'pipeline'];

/** "2 pipelines, configuration version 3", from the data the tab loaded. */
function PipelinesCountLine(): JSX.Element | null {
	const { data } = useQuery<SuccessResponse<Pipeline>>(PIPELINES_QUERY_KEY, {
		enabled: false,
	});
	const pipeline = data?.payload;

	if (!pipeline) {
		return null;
	}

	const count = pipeline.pipelines?.length ?? 0;

	return (
		<span data-testid="pipelines-count-line">
			<strong className="tw:font-semibold tw:text-foreground tw:tabular-nums">
				{count}
			</strong>{' '}
			<span>{count === 1 ? 'pipeline' : 'pipelines'}</span>, configuration version{' '}
			<strong className="tw:font-semibold tw:text-foreground tw:tabular-nums">
				{pipeline.version}
			</strong>
		</span>
	);
}

export default PipelinesCountLine;
