import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import { AlertTriangle, Route } from 'lucide-react';

import { ServiceMapData } from '../hooks/useServiceMapGraph';

interface ServiceMapStateProps {
	data: ServiceMapData;
}

function message(
	data: ServiceMapData,
): { title: string; detail: string; error: boolean } | null {
	if (data.status === 'loading') {
		return null;
	}
	if (data.status === 'error') {
		return {
			title: 'The service map could not be loaded',
			detail:
				data.error instanceof Error
					? data.error.message
					: 'The dependency graph request failed. Try again or pick another time range.',
			error: true,
		};
	}
	return {
		title: 'No services in this time range',
		detail:
			'No spans were reported for the selected range and filters. Widen the time range or clear a filter.',
		error: false,
	};
}

/** Loading, error and empty states of the map. */
function ServiceMapState({ data }: ServiceMapStateProps): JSX.Element {
	const content = message(data);
	if (!content) {
		return (
			<div
				data-testid="service-map-loading"
				className="fs-ui tw:flex tw:flex-col tw:gap-3"
			>
				<Skeleton className="tw:h-[92px] tw:rounded-xl" />
				<Skeleton className="tw:h-[clamp(460px,62vh,760px)] tw:rounded-xl" />
			</div>
		);
	}
	const Icon = content.error ? AlertTriangle : Route;
	return (
		<ContentPanel testId="service-map-graph">
			<div
				data-testid={content.error ? 'service-map-error' : 'service-map-empty'}
				className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-5 tw:py-16 tw:text-center tw:font-sans"
			>
				<Icon
					aria-hidden="true"
					className={
						content.error
							? 'tw:size-6 tw:text-error'
							: 'tw:size-6 tw:text-subtle-foreground'
					}
				/>
				<h2 className="tw:text-sm tw:font-semibold tw:text-foreground">
					{content.title}
				</h2>
				<p className="tw:max-w-md tw:text-[13px] tw:text-muted-foreground">
					{content.detail}
				</p>
			</div>
		</ContentPanel>
	);
}

export default ServiceMapState;
