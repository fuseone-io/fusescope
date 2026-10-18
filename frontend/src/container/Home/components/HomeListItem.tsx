import { MouseEvent, ReactNode } from 'react';

interface HomeListItemProps {
	icon: ReactNode;
	label: ReactNode;
	trailing?: ReactNode;
	onOpen: (event: MouseEvent<HTMLElement>) => void;
}

/** A clickable row of a Home widget list. */
function HomeListItem({
	icon,
	label,
	trailing,
	onOpen,
}: HomeListItemProps): JSX.Element {
	return (
		<li className="tw:border-t tw:border-border">
			<button
				type="button"
				onClick={onOpen}
				className="tw:flex tw:min-h-10 tw:w-full tw:cursor-pointer tw:items-center tw:gap-3 tw:px-5 tw:py-2.5 tw:text-left tw:text-[13px] tw:text-foreground tw:outline-none tw:hover:bg-muted tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset"
			>
				<span
					aria-hidden="true"
					className="tw:flex-none tw:text-subtle-foreground tw:[&_svg]:size-4"
				>
					{icon}
				</span>
				<span className="tw:min-w-0 tw:flex-1 tw:truncate">{label}</span>
				{trailing && (
					<span className="tw:flex tw:max-w-[55%] tw:flex-none tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5">
						{trailing}
					</span>
				)}
			</button>
		</li>
	);
}

export default HomeListItem;
