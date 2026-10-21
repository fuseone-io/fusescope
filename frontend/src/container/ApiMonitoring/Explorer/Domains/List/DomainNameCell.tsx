import { Link } from 'react-router-dom';

interface DomainNameCellProps {
	domain: string;
	href: string;
	isIp: boolean;
	callers: string[] | undefined;
	onOpen: () => void;
}

const MAX_CALLERS = 2;

function callerHint(callers: string[]): string {
	const shown = callers.slice(0, MAX_CALLERS).join(', ');
	const more = callers.length - MAX_CALLERS;
	return more > 0 ? `from ${shown} +${more}` : `from ${shown}`;
}

/** The domain, an IP chip when it is an address, and the services calling it. */
function DomainNameCell({
	domain,
	href,
	isIp,
	callers,
	onOpen,
}: DomainNameCellProps): JSX.Element {
	return (
		<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			<Link
				to={href}
				onClick={(event): void => {
					event.stopPropagation();
					onOpen();
				}}
				className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium tw:text-foreground! tw:hover:underline"
				title={domain}
			>
				{domain}
			</Link>
			{isIp && (
				<span className="tw:inline-flex tw:h-5 tw:flex-none tw:items-center tw:rounded tw:border tw:font-sans tw:border-border tw:bg-surface-sunken tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-muted-foreground">
					IP
				</span>
			)}
			{callers && callers.length > 0 && (
				<span
					className="tw:truncate tw:text-xs tw:text-subtle-foreground"
					title={callers.join(', ')}
				>
					{callerHint(callers)}
				</span>
			)}
		</span>
	);
}

export default DomainNameCell;
