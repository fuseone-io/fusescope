import { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import ROUTES from 'constants/routes';
import { DraftingCompass, ScrollText } from 'lucide-react';

type Props = {
	/** The trigger; must accept a ref. */
	children: ReactElement;
	relatedTracesLink?: string;
	relatedLogsLink?: string;
};

const LINK_CLASS =
	'tw:flex tw:h-8 tw:items-center tw:gap-2 tw:rounded-sm tw:px-2 tw:text-[13px] tw:text-foreground tw:no-underline tw:outline-none tw:hover:bg-accent tw:hover:text-foreground tw:focus-visible:bg-accent';

function AlertPopover({
	children,
	relatedTracesLink,
	relatedLogsLink,
}: Props): JSX.Element {
	return (
		<Popover>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align="end"
				className="tw:z-[1050] tw:flex tw:w-44 tw:flex-col tw:p-1 tw:font-sans"
			>
				{!!relatedLogsLink && (
					<Link
						to={`${ROUTES.LOGS_EXPLORER}?${relatedLogsLink}`}
						className={LINK_CLASS}
						data-testid="alert-popover-view-logs"
					>
						<ScrollText
							aria-hidden="true"
							className="tw:size-4 tw:text-muted-foreground"
						/>
						View Logs
					</Link>
				)}
				{!!relatedTracesLink && (
					<Link
						to={`${ROUTES.TRACES_EXPLORER}?${relatedTracesLink}`}
						className={LINK_CLASS}
						data-testid="alert-popover-view-traces"
					>
						<DraftingCompass
							aria-hidden="true"
							className="tw:size-4 tw:text-muted-foreground"
						/>
						View Traces
					</Link>
				)}
			</PopoverContent>
		</Popover>
	);
}

AlertPopover.defaultProps = {
	relatedTracesLink: '',
	relatedLogsLink: '',
};

type ConditionalAlertPopoverProps = {
	relatedTracesLink: string;
	relatedLogsLink: string;
	children: ReactElement;
};
export function ConditionalAlertPopover({
	children,
	relatedTracesLink,
	relatedLogsLink,
}: ConditionalAlertPopoverProps): JSX.Element {
	if (relatedTracesLink || relatedLogsLink) {
		return (
			<AlertPopover
				relatedTracesLink={relatedTracesLink}
				relatedLogsLink={relatedLogsLink}
			>
				{children}
			</AlertPopover>
		);
	}
	return children;
}
export default AlertPopover;
