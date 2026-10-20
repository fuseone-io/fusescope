import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface PageTemplateProps {
	children: ReactNode;
	testId?: string;
	className?: string;
}

/**
 * The page column: background, gutters, max width and the vertical rhythm
 * between header, tabs and panels. Not `fs-ui` itself, so legacy widgets in
 * the page keep their styles; each template part scopes itself.
 */
function PageTemplate({
	children,
	testId,
	className,
}: PageTemplateProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:min-h-full tw:w-full tw:flex-none tw:bg-background tw:text-foreground"
		>
			<div
				className={cn(
					'tw:mx-auto tw:box-border tw:flex tw:w-full tw:max-w-[1600px] tw:flex-col tw:gap-6 tw:p-4 tw:md:p-6',
					className,
				)}
			>
				{children}
			</div>
		</div>
	);
}

export default PageTemplate;
