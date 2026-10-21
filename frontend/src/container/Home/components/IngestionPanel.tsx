import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { formatCount } from 'lib/apm/format';
import {
	ArrowRight,
	BarChart3,
	DraftingCompass,
	LucideIcon,
	Plus,
	ScrollText,
} from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';

import { IngestingSignals } from '../utils';
import { useConnectDataSource } from './useConnectDataSource';

interface Signal {
	source: 'Logs' | 'Traces' | 'Metrics';
	active: boolean;
	detail?: string;
	route: string;
	icon: LucideIcon;
}

interface IngestionPanelProps {
	signals: IngestingSignals;
	logRecords: number;
	spans: number;
	/** Viewers can't add a source. */
	canConnect: boolean;
	className?: string;
}

function IngestionPanel({
	signals,
	logRecords,
	spans,
	canConnect,
	className,
}: IngestionPanelProps): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const connect = useConnectDataSource();

	const rows: Signal[] = [
		{
			source: 'Logs',
			active: signals.logs,
			detail: `${formatCount(logRecords)} log records`,
			route: ROUTES.LOGS_EXPLORER,
			icon: ScrollText,
		},
		{
			source: 'Traces',
			active: signals.traces,
			detail: `${formatCount(spans)} spans`,
			route: ROUTES.TRACES_EXPLORER,
			icon: DraftingCompass,
		},
		{
			source: 'Metrics',
			active: signals.metrics,
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
		<ContentPanel
			testId="home-ingestion"
			title="Data sources"
			subtitle="Signals received in the last 30 minutes"
			actions={
				canConnect && (
					<Button variant="outline" size="sm" onClick={connect}>
						<Plus aria-hidden="true" />
						Connect data source
					</Button>
				)
			}
			className={className}
		>
			<ul className="fs-ui tw:font-sans">
				{rows
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
								<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-snug">
									<span className="tw:font-medium">{signal.source}</span>
									{signal.detail && (
										<span className="tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
											{signal.detail}
										</span>
									)}
								</span>
								<StatusBadge tone="success" dot>
									Ingestion active
								</StatusBadge>
								<Button
									variant="ghost"
									size="sm"
									onClick={(event): void => handleExplore(signal, event)}
									className="tw:text-[13px] tw:text-primary"
								>
									Explore {signal.source.toLowerCase()}
									<ArrowRight aria-hidden="true" />
								</Button>
							</li>
						);
					})}
			</ul>
		</ContentPanel>
	);
}

export default IngestionPanel;
