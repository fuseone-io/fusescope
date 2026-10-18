import { ReactNode } from 'react';

interface InfraListLayoutProps {
	rail?: ReactNode;
	children: ReactNode;
}

/**
 * The filter rail beside the list, both bounded to the page's height: the list
 * sizes its page to the room it gets.
 */
function InfraListLayout({
	rail,
	children,
}: InfraListLayoutProps): JSX.Element {
	return (
		<div className="tw:flex tw:h-full tw:min-h-0 tw:w-full tw:overflow-x-auto">
			{rail}
			<div
				data-testid="infra-list-column"
				className="tw:flex tw:min-h-0 tw:min-w-[800px] tw:flex-1 tw:flex-col tw:gap-3 tw:px-4 tw:pt-4 tw:pb-6 tw:md:px-6"
			>
				{children}
			</div>
		</div>
	);
}

export default InfraListLayout;
