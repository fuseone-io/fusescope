import { MouseEvent } from 'react';
import logEvent from 'api/common/logEvent';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { formatLatencyMs, formatPercent, formatRate } from 'lib/apm/format';
import { useServiceKinds } from 'lib/apm/useServiceKinds';
import {
	errorRateDelta,
	p99Delta,
	rateDelta,
} from 'pages/Services/components/ServicesList/serviceCells';
import ServiceNameCell from 'pages/Services/components/ServicesList/ServiceNameCell';
import { ServiceRow } from 'pages/Services/components/ServicesList/serviceRows';
import { errorRateTone } from 'pages/Services/components/ServicesList/utils';
import { isModifierKeyPressed } from 'utils/app';

import MetricCell from './MetricCell';

const HEAD =
	'tw:h-8 tw:px-3 tw:text-right tw:text-[11px] tw:first:pl-5 tw:first:text-left tw:last:pr-5';
const NUMBER_CELL = 'tw:px-3 tw:text-right tw:last:pr-5';

const serviceHref = (serviceName: string): string =>
	`${ROUTES.APPLICATION}/${encodeURIComponent(serviceName)}`;

/** Before the name link stops the click, so link and row clicks both count. */
function logServiceClick(serviceName: string, event: MouseEvent): void {
	if (event.target instanceof Element && event.target.closest('button')) {
		return;
	}
	void logEvent('Homepage: Service clicked', { serviceName });
}

function ServicesTable({ rows }: { rows: ServiceRow[] }): JSX.Element {
	const identify = useServiceKinds();
	const { safeNavigate } = useSafeNavigate();

	return (
		<div className="fs-ui tw:overflow-x-auto tw:font-sans">
			<Table className="tw:min-w-[480px]">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow className="tw:hover:bg-transparent">
						<TableHead className={HEAD}>Service</TableHead>
						<TableHead className={HEAD}>p99</TableHead>
						<TableHead className={HEAD}>Error rate</TableHead>
						<TableHead className={HEAD}>Rate</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => {
						const tone = errorRateTone(row.errorRate);
						return (
							<TableRow
								key={row.serviceName}
								data-testid="home-service-row"
								className="tw:cursor-pointer"
								onClickCapture={(event): void =>
									logServiceClick(row.serviceName, event)
								}
								onClick={(event): void =>
									safeNavigate(serviceHref(row.serviceName), {
										newTab: isModifierKeyPressed(event),
									})
								}
							>
								<TableCell className="tw:max-w-0 tw:py-2 tw:pr-3 tw:pl-5">
									<ServiceNameCell
										service={row.service}
										badges={row.badges}
										identity={identify(row.serviceName)}
										href={serviceHref(row.serviceName)}
									/>
								</TableCell>
								<TableCell className={NUMBER_CELL}>
									<MetricCell value={formatLatencyMs(row.p99)} delta={p99Delta(row)} />
								</TableCell>
								<TableCell className={NUMBER_CELL}>
									<MetricCell
										delta={errorRateDelta(row)}
										value={
											<StatusBadge tone={tone === 'success' ? 'neutral' : tone}>
												{formatPercent(row.errorRate)}
											</StatusBadge>
										}
									/>
								</TableCell>
								<TableCell className={NUMBER_CELL}>
									<MetricCell value={formatRate(row.callRate)} delta={rateDelta(row)} />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

export default ServicesTable;
