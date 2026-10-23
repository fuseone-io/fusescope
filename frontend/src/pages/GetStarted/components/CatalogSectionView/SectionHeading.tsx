import { ReactNode } from 'react';

interface SectionHeadingProps {
	icon: ReactNode;
	title: string;
	subtitle: string;
	id?: string;
	action?: ReactNode;
}

function SectionHeading({
	icon,
	title,
	subtitle,
	id,
	action,
}: SectionHeadingProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-x-4 tw:gap-y-1">
			<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-7 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink tw:[&_svg]:size-4"
				>
					{icon}
				</span>
				<div className="tw:min-w-0">
					<h2 id={id} className="tw:text-[15px] tw:font-semibold">
						{title}
					</h2>
					<p className="tw:text-[13px] tw:text-muted-foreground">{subtitle}</p>
				</div>
			</div>
			{action}
		</div>
	);
}

export default SectionHeading;
