import { ReactNode } from 'react';
import { SearchX } from 'lucide-react';

interface ListEmptyStateProps {
	children: ReactNode;
	testId?: string;
}

function ListEmptyState({
	children,
	testId,
}: ListEmptyStateProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-2 tw:px-5 tw:py-12 tw:text-center tw:font-sans tw:text-[13px] tw:text-muted-foreground"
		>
			<SearchX
				aria-hidden="true"
				className="tw:size-6 tw:text-subtle-foreground"
			/>
			<p>{children}</p>
		</div>
	);
}

export default ListEmptyState;
