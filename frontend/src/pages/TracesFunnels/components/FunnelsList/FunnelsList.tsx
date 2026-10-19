import { useState } from 'react';
import { generatePath, Link } from 'react-router-dom';
import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import ROUTES from 'constants/routes';
import dayjs from 'dayjs';
import { CalendarClock, DecimalsArrowRight, Funnel } from 'lucide-react';
import { FunnelData } from 'types/api/traceFunnels';

import FunnelItemPopover from './FunnelItemPopover';

const ITEM_CLASS =
	'funnel-item fs-ui tw:flex tw:w-full tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-solid tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:text-left tw:font-sans tw:text-foreground tw:no-underline! tw:transition-colors tw:hover:bg-muted';

interface FunnelListItemProps {
	funnel: FunnelData;
	onFunnelClick?: (funnel: FunnelData) => void;
	shouldRedirectToTracesListOnDeleteSuccess?: boolean;
	isSpanDetailsPage?: boolean;
}

export function FunnelListItem({
	funnel,
	onFunnelClick,
	shouldRedirectToTracesListOnDeleteSuccess,
	isSpanDetailsPage,
}: FunnelListItemProps): JSX.Element {
	const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
	const funnelDetailsLink = generatePath(ROUTES.TRACES_FUNNELS_DETAIL, {
		funnelId: funnel.funnel_id,
	});

	const content = (
		<>
			<div className="tw:flex tw:min-h-6 tw:items-center tw:justify-between tw:gap-3">
				<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-primary-soft tw:text-primary-ink"
					>
						<Funnel className="tw:size-3.5" />
					</span>
					<span className="tw:truncate tw:text-sm tw:font-medium tw:text-primary">
						{funnel.funnel_name}
					</span>
				</span>

				{isSpanDetailsPage ? (
					<span className="tw:inline-flex tw:h-7 tw:flex-none tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-solid tw:border-input tw:bg-surface-raised tw:px-2.5 tw:text-xs tw:font-medium tw:text-foreground">
						<DecimalsArrowRight className="tw:size-3.5" />
						Open funnel
					</span>
				) : (
					<FunnelItemPopover
						isPopoverOpen={isPopoverOpen}
						setIsPopoverOpen={setIsPopoverOpen}
						funnel={funnel}
						shouldRedirectToTracesListOnDeleteSuccess={
							shouldRedirectToTracesListOnDeleteSuccess
						}
					/>
				)}
			</div>

			<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-1 tw:pl-[34px]">
				<span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
					<CalendarClock
						aria-hidden="true"
						className="tw:size-3.5 tw:flex-none tw:text-subtle-foreground"
					/>
					<span className="tw:font-mono tw:tabular-nums">
						{dayjs(funnel.created_at).format(DATE_TIME_FORMATS.FUNNELS_LIST_DATE)}
					</span>
				</span>
				<span className="tw:min-w-0">
					<UserAvatarCell email={funnel.user_email} />
				</span>
			</div>
		</>
	);

	return onFunnelClick ? (
		<button
			type="button"
			className={`${ITEM_CLASS} tw:cursor-pointer`}
			onClick={(): void => onFunnelClick(funnel)}
		>
			{content}
		</button>
	) : (
		<Link to={funnelDetailsLink} className={ITEM_CLASS}>
			{content}
		</Link>
	);
}

FunnelListItem.defaultProps = {
	onFunnelClick: undefined,
	shouldRedirectToTracesListOnDeleteSuccess: true,
	isSpanDetailsPage: false,
};

interface FunnelsListProps {
	data: FunnelData[];
	onFunnelClick?: (funnel: FunnelData) => void;
	shouldRedirectToTracesListOnDeleteSuccess?: boolean;
}

function FunnelsList({
	data,
	onFunnelClick,
	shouldRedirectToTracesListOnDeleteSuccess,
}: FunnelsListProps): JSX.Element {
	return (
		<div className="funnels-list tw:flex tw:flex-col tw:gap-2">
			{data?.map((funnel) => (
				<FunnelListItem
					key={funnel.funnel_id}
					funnel={funnel}
					onFunnelClick={onFunnelClick}
					shouldRedirectToTracesListOnDeleteSuccess={
						shouldRedirectToTracesListOnDeleteSuccess
					}
				/>
			))}
		</div>
	);
}

FunnelsList.defaultProps = {
	onFunnelClick: undefined,
	shouldRedirectToTracesListOnDeleteSuccess: true,
};

export default FunnelsList;
