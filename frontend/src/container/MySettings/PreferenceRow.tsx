import { ReactNode } from 'react';

interface PreferenceRowProps {
	title: ReactNode;
	description: ReactNode;
	control: ReactNode;
	children?: ReactNode;
	className?: string;
}

/** One preference: title and description on the left, its control on the right. */
function PreferenceRow({
	title,
	description,
	control,
	children,
	className,
}: PreferenceRowProps): JSX.Element {
	return (
		<div className={className}>
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-6 tw:gap-y-3 tw:px-5 tw:py-4 tw:font-sans">
				<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
					<h3 className="tw:text-sm tw:font-medium tw:text-foreground">{title}</h3>
					<p className="tw:text-[13px] tw:text-muted-foreground">{description}</p>
				</div>
				<div className="tw:flex tw:flex-none tw:items-center">{control}</div>
			</div>
			{children && (
				<div className="fs-ui tw:-mt-1 tw:px-5 tw:pb-4 tw:font-sans">
					{children}
				</div>
			)}
		</div>
	);
}

export default PreferenceRow;
