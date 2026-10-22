import DeltaText from 'components/PageTemplate/components/DeltaText';
import Sparkline from 'components/PageTemplate/components/Sparkline';
import SdkBadge from 'components/Rum/SdkBadge';
import { Button } from 'components/ui/button';
import { TableCell, TableRow } from 'components/ui/table';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { formatCount, formatPercent } from 'lib/apm/format';
import { errorRateDelta } from 'lib/rum/errorRate';
import {
	formatAgo,
	formatCountChange,
	formatPointChange,
} from 'lib/rum/format';
import { rumApplicationUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';
import { Settings2 } from 'lucide-react';
import { isModifierKeyPressed } from 'utils/app';

import { ERROR_RATE_HIGH } from '../constants';
import { ApplicationRow as Row } from '../types';
import ApplicationNameCell from './ApplicationNameCell';
import VitalCell from './VitalCell';

interface ApplicationRowProps {
	row: Row;
	onOpenSettings: (applicationId: string) => void;
}

const STACK = 'tw:flex tw:flex-col tw:items-end tw:gap-0.5';

function ApplicationRow({
	row,
	onOpenSettings,
}: ApplicationRowProps): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const { application, metrics } = row;
	const errorRate = metrics?.current.errorRate;
	const high = errorRate !== undefined && errorRate >= ERROR_RATE_HIGH;
	const sessionsChange =
		metrics &&
		formatCountChange(metrics.current.sessions, metrics.previous?.sessions);
	const errorChange = errorRateDelta(errorRate, metrics?.previous?.errorRate);

	return (
		<TableRow
			data-testid="rum-application-row"
			className="tw:cursor-pointer"
			onClick={(event): void =>
				safeNavigate(rumApplicationUrl(application.id), {
					newTab: isModifierKeyPressed(event),
				})
			}
		>
			<TableCell className="tw:max-w-0">
				<ApplicationNameCell application={application} />
			</TableCell>
			<TableCell data-testid="rum-application-sessions">
				<span className={STACK}>
					<span className="tw:text-foreground tw:tabular-nums">
						{formatCount(metrics?.current.sessions)}
					</span>
					{sessionsChange && <DeltaText text={sessionsChange} tone="neutral" />}
				</span>
			</TableCell>
			<TableCell data-testid="rum-application-error-rate">
				<span className={STACK}>
					<span
						className={cn(
							'tw:tabular-nums',
							high ? 'tw:font-semibold tw:text-error-ink' : 'tw:text-foreground',
						)}
					>
						{formatPercent(errorRate)}
					</span>
					{errorChange !== undefined && (
						<DeltaText
							text={formatPointChange(errorChange) ?? ''}
							tone={errorChange > 0.5 ? 'bad' : 'neutral'}
						/>
					)}
				</span>
			</TableCell>
			<TableCell>
				<VitalCell
					vital="lcp"
					summary={metrics?.vitals.lcp}
					testId="rum-application-lcp"
				/>
			</TableCell>
			<TableCell>
				<VitalCell vital="inp" summary={metrics?.vitals.inp} />
			</TableCell>
			<TableCell>
				<VitalCell vital="cls" summary={metrics?.vitals.cls} />
			</TableCell>
			<TableCell className="tw:max-w-0">
				<SdkBadge
					name={metrics?.sdk?.name}
					version={metrics?.sdk?.version}
					support={row.support}
					testId="rum-application-sdk"
				/>
			</TableCell>
			<TableCell>
				<span className="tw:flex tw:items-center tw:gap-2">
					<Sparkline values={metrics?.activity ?? []} />
					<span className="tw:text-xs tw:whitespace-nowrap tw:text-muted-foreground tw:tabular-nums">
						{metrics?.lastSeen ? formatAgo(metrics.lastSeen) : 'No data yet'}
					</span>
				</span>
			</TableCell>
			<TableCell>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Settings for ${application.name}`}
					data-testid="rum-application-settings"
					onClick={(event): void => {
						event.stopPropagation();
						onOpenSettings(application.id);
					}}
				>
					<Settings2 />
				</Button>
			</TableCell>
		</TableRow>
	);
}

export default ApplicationRow;
