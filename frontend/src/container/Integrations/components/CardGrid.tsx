import { ReactNode } from 'react';

interface CardGridProps {
	children: ReactNode;
	testId?: string;
}

function CardGrid({ children, testId }: CardGridProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] tw:gap-3"
		>
			{children}
		</div>
	);
}

export default CardGrid;
