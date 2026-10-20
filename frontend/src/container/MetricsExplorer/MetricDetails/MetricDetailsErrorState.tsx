import { Button } from 'components/ui/button';
import { Info } from 'lucide-react';

import { MetricDetailsErrorStateProps } from './types';

function MetricDetailsErrorState({
	refetch,
	errorMessage,
}: MetricDetailsErrorStateProps): JSX.Element {
	return (
		<div className="metric-details-error-state fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:px-4 tw:py-3 tw:font-sans tw:text-[13px] tw:text-foreground">
			<Info aria-hidden="true" className="tw:size-4 tw:text-error" />
			<span>{errorMessage}</span>
			{refetch && (
				<Button variant="outline" size="sm" onClick={refetch}>
					Retry
				</Button>
			)}
		</div>
	);
}

export default MetricDetailsErrorState;
