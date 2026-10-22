import { ReactNode } from 'react';

interface SectionHeadingProps {
	id: string;
	children: ReactNode;
}

function SectionHeading({ id, children }: SectionHeadingProps): JSX.Element {
	return (
		<h3 id={id} className="tw:text-sm tw:font-semibold tw:text-foreground">
			{children}
		</h3>
	);
}

export default SectionHeading;
