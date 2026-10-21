import { ReactNode } from 'react';

interface PanelSectionProps {
	title: ReactNode;
	hint?: ReactNode;
	children: ReactNode;
	testId?: string;
}

function PanelSection({
	title,
	hint,
	children,
	testId,
}: PanelSectionProps): JSX.Element {
	return (
		<section
			data-testid={testId}
			className="tw:flex tw:flex-col tw:gap-1.5 tw:border-t tw:border-border tw:px-4 tw:py-3"
		>
			<div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				<h3 className="tw:text-[11px] tw:font-medium">{title}</h3>
				{hint && (
					<span className="tw:font-normal tw:tracking-normal tw:normal-case">
						{hint}
					</span>
				)}
			</div>
			{children}
		</section>
	);
}

export default PanelSection;
