import { Link } from 'react-router-dom';
import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import dayjs from 'dayjs';
import { formatCount } from 'lib/apm/format';
import { ArrowRight, Check } from 'lucide-react';

import { firstSeen, serviceRoute } from '../utils';

interface ReceivingPanelProps {
	service: string;
	status: OnboardingtypesStatusDTO;
}

/** Counts since the app started, and where to look next. */
function ReceivingPanel({ service, status }: ReceivingPanelProps): JSX.Element {
	const first = firstSeen(status);
	const counts = [
		{ id: 'spans', label: 'Spans', value: status.traces?.count },
		{ id: 'series', label: 'Metric series', value: status.metrics?.series },
		{ id: 'logs', label: 'Logs', value: status.logs?.count },
		{ id: 'operations', label: 'Operations', value: status.traces?.operations },
	];

	return (
		<section
			aria-live="polite"
			aria-labelledby="guide-receiving-title"
			data-testid="guide-receiving"
			className="tw:flex tw:flex-col tw:gap-4 tw:rounded-xl tw:border tw:border-success/40 tw:bg-success-soft/40 tw:p-4"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2.5 tw:gap-y-1">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-success tw:text-white"
				>
					<Check className="tw:size-3" />
				</span>
				<h3 id="guide-receiving-title" className="tw:text-sm tw:font-semibold">
					Receiving data from{' '}
					<span className="tw:font-mono tw:font-medium">{service}</span>
				</h3>
				{first && (
					<span className="tw:text-xs tw:text-subtle-foreground">
						first seen {dayjs(first).format('HH:mm:ss')}
					</span>
				)}
			</div>
			<dl className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(110px,1fr))] tw:gap-3">
				{counts.map((count) => (
					<div key={count.id} className="tw:flex tw:flex-col tw:gap-0.5">
						<dt className="tw:text-xs tw:text-subtle-foreground">{count.label}</dt>
						<dd
							data-testid={`guide-count-${count.id}`}
							className="tw:text-lg tw:font-semibold tw:tabular-nums"
						>
							{formatCount(count.value ?? 0)}
						</dd>
					</div>
				))}
			</dl>
			<div className="tw:flex tw:flex-wrap tw:gap-2">
				<Button asChild size="sm">
					<Link
						to={serviceRoute(service)}
						data-testid="guide-open-service"
						className="tw:bg-primary! tw:text-primary-foreground! tw:no-underline! tw:hover:bg-primary-strong!"
					>
						Open {service}
						<ArrowRight aria-hidden="true" />
					</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link
						to={ROUTES.TRACES_EXPLORER}
						data-testid="guide-open-traces"
						className="tw:text-foreground! tw:no-underline!"
					>
						View traces
					</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link
						to={ROUTES.LOGS_EXPLORER}
						data-testid="guide-open-logs"
						className="tw:text-foreground! tw:no-underline!"
					>
						View logs
					</Link>
				</Button>
				<Button asChild variant="ghost" size="sm">
					<Link
						to={ROUTES.GET_STARTED}
						data-testid="guide-add-another"
						className="tw:text-foreground! tw:no-underline!"
					>
						Add another source
					</Link>
				</Button>
			</div>
		</section>
	);
}

export default ReceivingPanel;
