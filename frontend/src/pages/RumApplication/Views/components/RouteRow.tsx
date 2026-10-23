import { TableCell, TableRow } from 'components/ui/table';
import { formatCount } from 'lib/apm/format';
import { formatMs, formatTimeOnView } from 'lib/rum/format';
import { cn } from 'lib/utils';

import { SLOW_REQUEST_MS } from '../../constants';
import { ViewRow } from '../types';
import VitalCell from './VitalCell';

interface RouteRowProps {
	row: ViewRow;
	selected: boolean;
	onOpen: (route: string) => void;
}

const NUMBER = 'tw:text-right tw:tabular-nums';

function RouteRow({ row, selected, onOpen }: RouteRowProps): JSX.Element {
	const unknown =
		row.unknownLoads > 0
			? `${formatCount(row.unknownLoads)} more views without a loading type (SDK before 0.2.0)`
			: undefined;
	return (
		<TableRow
			data-testid="rum-views-row"
			data-state={selected ? 'selected' : undefined}
		>
			<TableCell className="tw:max-w-[240px]">
				<button
					type="button"
					onClick={(): void => onOpen(row.route)}
					aria-label={`Open ${row.route} details`}
					data-testid="rum-views-open"
					className="tw:max-w-full tw:cursor-pointer tw:truncate tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:font-mono tw:text-xs tw:font-medium tw:text-primary! tw:hover:underline"
				>
					{row.route}
				</button>
			</TableCell>
			<TableCell className={NUMBER} title={unknown}>
				{formatCount(row.pageLoads)}
				{unknown && <span className="tw:text-subtle-foreground">*</span>}
			</TableCell>
			<TableCell className={NUMBER} title={unknown}>
				{formatCount(row.routeChanges)}
				{unknown && <span className="tw:text-subtle-foreground">*</span>}
			</TableCell>
			<TableCell>
				<VitalCell vital="lcp" route={row.route} summary={row.lcp} />
			</TableCell>
			<TableCell>
				<VitalCell vital="inp" route={row.route} summary={row.inp} />
			</TableCell>
			<TableCell>
				<VitalCell vital="cls" route={row.route} summary={row.cls} />
			</TableCell>
			<TableCell className={NUMBER}>
				{formatTimeOnView(row.timeOnViewMs)}
			</TableCell>
			<TableCell
				className={cn(
					NUMBER,
					row.errors > 0 && 'tw:font-semibold tw:text-error-ink',
				)}
			>
				{formatCount(row.errors)}
			</TableCell>
			<TableCell className="tw:max-w-[220px]">
				{row.slowest ? (
					<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
						<span
							title={[row.slowest.label, row.slowest.host].filter(Boolean).join(' · ')}
							className="tw:truncate tw:font-mono tw:text-xs tw:text-foreground"
						>
							{row.slowest.label}
						</span>
						<span
							className={cn(
								'tw:text-xs tw:tabular-nums',
								row.slowest.p75Ms >= SLOW_REQUEST_MS
									? 'tw:text-warning-ink'
									: 'tw:text-muted-foreground',
							)}
						>
							p75 {formatMs(row.slowest.p75Ms)}
						</span>
					</span>
				) : (
					<span className="tw:text-subtle-foreground">—</span>
				)}
			</TableCell>
		</TableRow>
	);
}

export default RouteRow;
