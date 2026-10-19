import { MouseEvent, useState } from 'react';
import { generatePath, Link } from 'react-router-dom';
import { TableCell, TableRow } from 'components/ui/table';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import ROUTES from 'constants/routes';
import dayjs from 'dayjs';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { CalendarClock, Funnel } from 'lucide-react';
import { FunnelData } from 'types/api/traceFunnels';
import { isModifierKeyPressed } from 'utils/app';

import FunnelItemPopover from '../FunnelsList/FunnelItemPopover';
import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';

interface FunnelRowProps {
	funnel: FunnelData;
}

function FunnelRow({ funnel }: FunnelRowProps): JSX.Element {
	const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
	const { safeNavigate } = useSafeNavigate();
	const href = generatePath(ROUTES.TRACES_FUNNELS_DETAIL, {
		funnelId: funnel.funnel_id,
	});

	const handleRowClick = (event: MouseEvent<HTMLTableRowElement>): void => {
		if ((event.target as HTMLElement).closest('a')) {
			return;
		}
		safeNavigate(href, { newTab: isModifierKeyPressed(event) });
	};

	return (
		<TableRow
			data-testid="funnel-row"
			className="tw:cursor-pointer"
			onClick={handleRowClick}
		>
			<TableCell className="tw:h-12 tw:max-w-0 tw:px-4">
				<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-6 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-primary-soft tw:text-primary-ink"
					>
						<Funnel className="tw:size-3.5" />
					</span>
					<Link
						to={href}
						className="tw:truncate tw:font-medium tw:text-primary! tw:hover:text-primary-strong! tw:hover:underline"
					>
						{funnel.funnel_name}
					</Link>
				</span>
			</TableCell>
			<TableCell className="tw:px-4">
				<span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
					<CalendarClock
						aria-hidden="true"
						className="tw:size-3.5 tw:flex-none tw:text-subtle-foreground"
					/>
					<span className="tw:font-mono tw:tabular-nums">
						{dayjs(funnel.created_at).format(DATE_TIME_FORMATS.FUNNELS_LIST_DATE)}
					</span>
				</span>
			</TableCell>
			<TableCell className="tw:max-w-0 tw:px-4">
				<UserAvatarCell email={funnel.user_email} />
			</TableCell>
			<TableCell className="tw:px-4 tw:text-right">
				<FunnelItemPopover
					isPopoverOpen={isMenuOpen}
					setIsPopoverOpen={setIsMenuOpen}
					funnel={funnel}
				/>
			</TableCell>
		</TableRow>
	);
}

export default FunnelRow;
