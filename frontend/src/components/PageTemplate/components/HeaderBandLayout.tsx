import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface HeaderBandLayoutProps {
	/** Usually a `CompactPageHeader`. */
	header: ReactNode;
	children: ReactNode;
	/**
	 * Fill the viewport and hand the remaining height to the body, for pages
	 * whose panes scroll on their own (filter rail beside a sized list).
	 */
	bounded?: boolean;
	testId?: string;
	bodyClassName?: string;
}

/**
 * A full-width raised band with the page header, above full-width
 * content. Not `fs-ui` itself, so legacy widgets in the body keep their styles.
 */
function HeaderBandLayout({
	header,
	children,
	bounded = false,
	testId,
	bodyClassName,
}: HeaderBandLayoutProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'tw:flex tw:w-full tw:flex-col tw:bg-background tw:text-foreground',
				bounded ? 'tw:h-full tw:min-h-0' : 'tw:min-h-full',
			)}
		>
			<div className="tw:flex-none tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-4 tw:md:px-6">
				{header}
			</div>
			<div
				className={cn(
					'tw:flex tw:min-w-0 tw:flex-1 tw:flex-col',
					bounded && 'tw:min-h-0',
					bodyClassName,
				)}
			>
				{children}
			</div>
		</div>
	);
}

export default HeaderBandLayout;
