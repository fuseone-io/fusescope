import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import {
	ChevronLeft,
	ChevronRight,
	LoaderCircle,
	ScrollText,
	Waypoints,
} from 'lucide-react';

import { useErrorNeighbours } from './useErrorNeighbours';

type Neighbours = ReturnType<typeof useErrorNeighbours>;

interface ErrorEventActionsProps {
	neighbours: Neighbours;
	onViewTrace: (event: React.MouseEvent) => void;
	onViewLogs: (event: React.MouseEvent) => void;
}

/** Older and Newer walk the group's events; the rest open the event's trace or its logs. */
function ErrorEventActions({
	neighbours,
	onViewTrace,
	onViewLogs,
}: ErrorEventActionsProps): JSX.Element {
	const { t } = useTranslation(['errorDetails']);
	const { older, newer, isLoading, goTo } = neighbours;

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				data-testid="error-details-older"
				disabled={isLoading || !older}
				onClick={(): void => goTo(older)}
			>
				{isLoading ? <LoaderCircle className="tw:animate-spin" /> : <ChevronLeft />}
				<span className="translate-safe">{t('older')}</span>
			</Button>
			<Button
				variant="outline"
				size="sm"
				data-testid="error-details-newer"
				disabled={isLoading || !newer}
				onClick={(): void => goTo(newer)}
			>
				<span className="translate-safe">{t('newer')}</span>
				{isLoading ? (
					<LoaderCircle className="tw:animate-spin" />
				) : (
					<ChevronRight />
				)}
			</Button>
			<Button
				variant="outline"
				size="sm"
				data-testid="error-details-logs"
				onClick={onViewLogs}
			>
				<ScrollText />
				View logs
			</Button>
			<Button
				size="sm"
				title={t('see_trace_graph')}
				data-testid="error-details-trace"
				onClick={onViewTrace}
			>
				<Waypoints />
				{t('see_error_in_trace_graph')}
			</Button>
		</>
	);
}

export default ErrorEventActions;
