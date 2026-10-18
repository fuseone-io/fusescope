import { MouseEvent } from 'react';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { cn } from 'lib/utils';
import { errorRateTone } from 'pages/Services/components/ServicesList/utils';
import { ServicesList } from 'types/api/metrics/getService';

import { columns, ServiceColumn } from './constants';

const CELL_CLASSES: Record<ServiceColumn['key'], string> = {
	serviceName:
		'tw:max-w-0 tw:truncate tw:px-5 tw:font-mono tw:text-xs tw:text-primary',
	p99: 'tw:px-3 tw:text-right tw:tabular-nums',
	errorRate: 'tw:px-3 tw:text-right',
	callRate: 'tw:px-5 tw:text-right tw:text-muted-foreground tw:tabular-nums',
};

interface ServicesTableProps {
	services: ServicesList[];
	onRowClick: (record: ServicesList, event: MouseEvent) => void;
}

function ServicesTable({
	services,
	onRowClick,
}: ServicesTableProps): JSX.Element {
	return (
		<div className="fs-ui tw:overflow-x-auto tw:font-sans">
			<Table className="tw:min-w-[420px]">
				<TableHeader>
					<TableRow className="tw:bg-muted tw:hover:bg-muted">
						{columns.map((column) => (
							<TableHead
								key={column.key}
								className={cn(
									'tw:h-auto tw:px-3 tw:py-2 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:whitespace-normal tw:text-muted-foreground tw:first:pl-5 tw:last:pr-5',
									column.numeric && 'tw:text-right',
								)}
							>
								{column.title}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{services.map((service) => (
						<TableRow
							key={service.serviceName}
							data-testid="home-service-row"
							className="tw:cursor-pointer"
							onClick={(event): void => onRowClick(service, event)}
						>
							{columns.map((column) => (
								<TableCell key={column.key} className={CELL_CLASSES[column.key]}>
									{column.key === 'errorRate' ? (
										<StatusBadge tone={errorRateTone(service.errorRate)}>
											{column.render(service)}
										</StatusBadge>
									) : (
										column.render(service)
									)}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export default ServicesTable;
