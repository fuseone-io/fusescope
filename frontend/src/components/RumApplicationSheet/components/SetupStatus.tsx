import { Link } from 'react-router-dom';
import type { RumtypesGettableApplicationStatusDTO } from 'api/generated/services/fuseScope.schemas';
import SdkBadge from 'components/Rum/SdkBadge';
import { Button } from 'components/ui/button';
import dayjs from 'dayjs';
import { rumApplicationUrl } from 'lib/rum/links';
import { cn } from 'lib/utils';
import { ArrowRight, Check } from 'lucide-react';

import RejectionLine from './RejectionLine';
import StatusCounts from './StatusCounts';

interface SetupStatusProps {
	applicationId: string;
	applicationName: string;
	firstOrigin?: string;
	status?: RumtypesGettableApplicationStatusDTO;
	onAddOrigin?: (origin: string) => void;
}

const CHECK = 'tw:flex tw:items-start tw:gap-2 tw:text-[13px]';
const DOT =
	'tw:mt-0.5 tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full';

/** "Waiting for first data…" until the gateway accepts some, then what it receives. */
function SetupStatus({
	applicationId,
	applicationName,
	firstOrigin,
	status,
	onAddOrigin,
}: SetupStatusProps): JSX.Element {
	const receiving = Boolean(status?.firstSeenAt);
	const rejections = status?.rejections ?? [];
	const minutes = Math.round((status?.windowSeconds ?? 300) / 60);

	return (
		<section
			aria-live="polite"
			aria-labelledby="rum-setup-status"
			data-testid="rum-setup-status"
			data-state={receiving ? 'receiving' : 'waiting'}
			className={cn(
				'tw:flex tw:flex-col tw:gap-3 tw:rounded-[10px] tw:border tw:p-4',
				receiving ? 'tw:border-success' : 'tw:border-border',
			)}
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2.5">
				{receiving ? (
					<span
						className={cn(DOT, 'tw:mt-0 tw:bg-success-soft tw:text-success-ink')}
					>
						<Check aria-hidden="true" className="tw:size-3" />
					</span>
				) : (
					<span
						aria-hidden="true"
						className="tw:size-2.5 tw:animate-pulse tw:rounded-full tw:bg-primary"
					/>
				)}
				<h3 id="rum-setup-status" className="tw:text-sm tw:font-semibold">
					{receiving ? 'Receiving data' : 'Waiting for first data…'}
				</h3>
				{receiving && status?.firstSeenAt && (
					<span className="tw:text-xs tw:text-subtle-foreground">
						first data {dayjs(status.firstSeenAt).format('MMM D, HH:mm:ss')}
					</span>
				)}
			</div>
			{!receiving && (
				<p className="tw:text-[13px] tw:text-muted-foreground">
					Deploy the snippet and open{' '}
					<span className="tw:font-mono tw:text-foreground">
						{firstOrigin ?? 'your site'}
					</span>
					. This updates by itself.
				</p>
			)}
			{receiving && status && <StatusCounts counts={status.counts} />}
			<div className="tw:flex tw:flex-col tw:gap-1.5">
				<span className={CHECK}>
					<span className={cn(DOT, 'tw:bg-success-soft tw:text-success-ink')}>
						<Check aria-hidden="true" className="tw:size-3" />
					</span>
					Application and key created
				</span>
				{rejections.map((rejection) => (
					<RejectionLine
						key={rejection.reason}
						rejection={rejection}
						onAddOrigin={onAddOrigin}
					/>
				))}
				{receiving && status?.sdk.name ? (
					<span className={CHECK}>
						<span className={cn(DOT, 'tw:bg-success-soft tw:text-success-ink')}>
							<Check aria-hidden="true" className="tw:size-3" />
						</span>
						<SdkBadge
							name={status.sdk.name}
							version={status.sdk.version}
							support={status.sdk.support}
							inline
						/>
					</span>
				) : (
					!receiving && (
						<span className={cn(CHECK, 'tw:text-muted-foreground')}>
							<span
								className={cn(DOT, 'tw:border tw:border-dashed tw:border-border')}
							/>
							First session received
						</span>
					)
				)}
			</div>
			{receiving && (
				<>
					<span className="tw:text-xs tw:text-subtle-foreground">
						Counts cover the last {minutes} minutes.
					</span>
					<Button asChild size="sm" className="tw:self-start">
						<Link to={rumApplicationUrl(applicationId)} data-testid="rum-setup-open">
							Open {applicationName}
							<ArrowRight />
						</Link>
					</Button>
				</>
			)}
		</section>
	);
}

export default SetupStatus;
