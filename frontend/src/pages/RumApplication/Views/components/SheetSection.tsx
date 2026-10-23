import { ReactNode, useId } from 'react';

interface SheetSectionProps {
	title: string;
	/** Right of the title: a note, a control or a link. */
	aside?: ReactNode;
	children: ReactNode;
	testId?: string;
}

function SheetSection({
	title,
	aside,
	children,
	testId,
}: SheetSectionProps): JSX.Element {
	const id = useId();
	return (
		<section
			aria-labelledby={id}
			data-testid={testId}
			className="tw:flex tw:flex-col tw:gap-2.5"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<h3 id={id} className="tw:m-0 tw:text-sm tw:font-semibold">
					{title}
				</h3>
				{aside && (
					<span className="tw:text-xs tw:text-muted-foreground">{aside}</span>
				)}
			</div>
			{children}
		</section>
	);
}

export default SheetSection;
