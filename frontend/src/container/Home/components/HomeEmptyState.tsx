import { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

interface HomeEmptyStateProps {
	icon: ReactNode;
	title: string;
	description?: string;
	/** Primary call to action; omitted for viewers. */
	action?: ReactNode;
	onLearnMore?: () => void;
}

function HomeEmptyState({
	icon,
	title,
	description,
	action,
	onLearnMore,
}: HomeEmptyStateProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:px-5 tw:pt-4 tw:pb-8 tw:text-center tw:font-sans">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-lg tw:bg-muted tw:text-muted-foreground tw:[&_svg]:size-5"
			>
				{icon}
			</span>
			<div className="tw:flex tw:flex-col tw:gap-1">
				<p className="tw:text-sm tw:font-medium tw:text-foreground">{title}</p>
				{description && (
					<p className="tw:text-[13px] tw:text-muted-foreground">{description}</p>
				)}
			</div>
			{(action || onLearnMore) && (
				<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-3">
					{action}
					{onLearnMore && (
						<button
							type="button"
							onClick={onLearnMore}
							className="tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1 tw:text-[13px] tw:font-medium tw:text-primary tw:hover:underline"
						>
							Learn more <ArrowUpRight className="tw:size-3.5" aria-hidden="true" />
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export default HomeEmptyState;
