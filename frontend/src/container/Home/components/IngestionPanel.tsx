import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import Panel from 'components/PageTemplate/components/Panel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import {
	ArrowRight,
	BarChart3,
	DraftingCompass,
	LucideIcon,
	ScrollText,
} from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';

interface Signal {
	source: 'Logs' | 'Traces' | 'Metrics';
	active: boolean;
	route: string;
	icon: LucideIcon;
}

interface IngestionPanelProps {
	logs: boolean;
	traces: boolean;
	metrics: boolean;
	className?: string;
}

function IngestionPanel({
	logs,
	traces,
	metrics,
	className,
}: IngestionPanelProps): JSX.Element {
	const { safeNavigate } = useSafeNavigate();

	const signals: Signal[] = [
		{
			source: 'Logs',
			active: logs,
			route: ROUTES.LOGS_EXPLORER,
			icon: ScrollText,
		},
		{
			source: 'Traces',
			active: traces,
			route: ROUTES.TRACES_EXPLORER,
			icon: DraftingCompass,
		},
		{
			source: 'Metrics',
			active: metrics,
			route: ROUTES.METRICS_EXPLORER,
			icon: BarChart3,
		},
	];

	const handleExplore = (signal: Signal, event: MouseEvent): void => {
		void logEvent('Homepage: Ingestion Active Explore clicked', {
			source: signal.source,
		});
		safeNavigate(signal.route, { newTab: isModifierKeyPressed(event) });
	};

	return (
		<Panel
			testId="home-ingestion"
			title="Data sources"
			subtitle="Signals received in the last 30 minutes"
			className={className}
			bodyClassName="tw:pt-3"
		>
			<ul className="fs-ui tw:font-sans">
				{signals
					.filter((signal) => signal.active)
					.map((signal) => {
						const Icon = signal.icon;
						return (
							<li
								key={signal.source}
								className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:border-t tw:border-border tw:px-5 tw:py-2.5 tw:text-[13px]"
							>
								<span
									aria-hidden="true"
									className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
								>
									<Icon className="tw:size-4" />
								</span>
								<span className="tw:min-w-0 tw:flex-1 tw:font-medium">
									{signal.source} ingestion is active
								</span>
								<StatusBadge tone="success" dot>
									Active
								</StatusBadge>
								<Button
									variant="ghost"
									size="sm"
									onClick={(event): void => handleExplore(signal, event)}
									className="tw:text-[13px] tw:text-primary"
								>
									Explore {signal.source}
									<ArrowRight aria-hidden="true" />
								</Button>
							</li>
						);
					})}
			</ul>
		</Panel>
	);
}

export default IngestionPanel;
