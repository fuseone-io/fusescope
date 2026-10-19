import { useIsMutating } from 'react-query';
import Spinner from 'components/Spinner';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';

import EmptyFunnelResults from './EmptyFunnelResults';
import FunnelGraph from './FunnelGraph';
import OverallMetrics from './OverallMetrics';
import StepsTransitionResults from './StepsTransitionResults';

function FunnelResults(): JSX.Element {
	const {
		validTracesCount,
		isValidateStepsLoading,
		hasIncompleteStepFields,
		hasAllEmptyStepFields,
		funnelId,
	} = useFunnelContext();

	const isFunnelUpdateMutating = useIsMutating([
		REACT_QUERY_KEY.UPDATE_FUNNEL_STEPS,
		funnelId,
	]);

	if (hasAllEmptyStepFields) {
		return <EmptyFunnelResults />;
	}

	if (hasIncompleteStepFields) {
		return (
			<EmptyFunnelResults
				title="Missing service / span names"
				description="Fill in the service and span names for all the steps"
			/>
		);
	}

	if (isValidateStepsLoading || isFunnelUpdateMutating) {
		return (
			<div className="tw:flex tw:h-full tw:items-center tw:justify-center">
				<Spinner size="large" />
			</div>
		);
	}

	if (validTracesCount === 0) {
		return (
			<EmptyFunnelResults
				title="There are no traces that match the funnel steps."
				description="Check the service / span names in the funnel steps and try again to start seeing analytics here"
			/>
		);
	}

	return (
		<div className="funnel-results tw:flex tw:flex-col tw:gap-4">
			<OverallMetrics />
			<FunnelGraph />
			<StepsTransitionResults />
		</div>
	);
}

export default FunnelResults;
