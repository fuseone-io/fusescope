import { ReactNode } from 'react';

interface ServicesListGroupProps {
	label: string;
	children: ReactNode;
}

function ServicesListGroup({
	label,
	children,
}: ServicesListGroupProps): JSX.Element {
	return (
		<div className="tw:flex tw:flex-col tw:gap-0.5">
			<h3 className="tw:px-2 tw:pb-1 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase">
				{label}
			</h3>
			{children}
		</div>
	);
}

export default ServicesListGroup;
