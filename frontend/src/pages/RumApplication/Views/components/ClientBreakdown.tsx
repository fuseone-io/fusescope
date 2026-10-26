import type { RumtypesClientBreakdownDTO } from 'api/generated/services/fuseScope.schemas';
import { formatVital } from 'lib/rum/vitals';
import { cn } from 'lib/utils';

import { clientShares } from '../utils';
import SheetSection from './SheetSection';

interface ClientBreakdownProps {
	browsers: RumtypesClientBreakdownDTO[] | null;
	operatingSystems: RumtypesClientBreakdownDTO[] | null;
	/** A mobile application: devices instead of browsers, no LCP. */
	mobile?: boolean;
}

const LIMIT = 6;

function ClientBreakdown({
	browsers,
	operatingSystems,
	mobile = false,
}: ClientBreakdownProps): JSX.Element {
	const groups = [
		{ title: mobile ? 'Device' : 'Browser', shares: clientShares(browsers) },
		{ title: 'Operating system', shares: clientShares(operatingSystems) },
	];
	const basis = groups[0].shares.basis === 'views' ? 'views' : 'page loads';
	return (
		<SheetSection
			title={mobile ? 'Devices and OS' : 'Browsers and OS'}
			aside={mobile ? `share of ${basis}` : `share of ${basis} · LCP p75`}
			testId="rum-route-clients"
		>
			<div className="tw:grid tw:gap-4 tw:sm:grid-cols-2">
				{groups.map((group) => (
					<div key={group.title} className="tw:flex tw:flex-col tw:gap-2">
						<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
							{group.title}
						</span>
						{group.shares.rows.length === 0 && (
							<span className="tw:text-xs tw:text-subtle-foreground">No data</span>
						)}
						{group.shares.rows.slice(0, LIMIT).map((row) => (
							<div
								key={row.name}
								data-testid="rum-route-client"
								className={cn(
									'tw:grid tw:items-center tw:gap-2 tw:text-xs',
									mobile
										? 'tw:grid-cols-[minmax(0,1fr)_72px_36px]'
										: 'tw:grid-cols-[minmax(0,1fr)_72px_36px_52px]',
								)}
							>
								<span title={row.name} className="tw:truncate">
									{row.name}
								</span>
								<span
									role="img"
									aria-label={`${row.share}% of ${basis}`}
									className="tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-surface-sunken"
								>
									<span
										className="tw:block tw:h-full tw:rounded-full tw:bg-primary"
										style={{ width: `${row.share}%` }}
									/>
								</span>
								<span className="tw:text-right tw:tabular-nums">{row.share}%</span>
								{!mobile && (
									<span className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
										{row.lcpP75Ms === undefined ? '—' : formatVital('lcp', row.lcpP75Ms)}
									</span>
								)}
							</div>
						))}
					</div>
				))}
			</div>
		</SheetSection>
	);
}

export default ClientBreakdown;
