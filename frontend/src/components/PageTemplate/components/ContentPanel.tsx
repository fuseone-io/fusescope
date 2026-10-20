import { ReactNode, useId } from 'react';
import { cn } from 'lib/utils';

interface ContentPanelProps {
	title?: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	/** A line under the body: totals, sources, notes. */
	footer?: ReactNode;
	children: ReactNode;
	/** A rule between the header and the body, for tables. */
	divided?: boolean;
	testId?: string;
	className?: string;
	bodyClassName?: string;
}

/**
 * A raised `rounded-xl` section with a `px-5 py-3` header, as Metrics and
 * Dashboards draw theirs. Like `Panel`, only the header and footer carry
 * `fs-ui`, so legacy widgets in the body keep their own styles.
 */
function ContentPanel({
	title,
	subtitle,
	actions,
	footer,
	children,
	divided = false,
	testId,
	className,
	bodyClassName,
}: ContentPanelProps): JSX.Element {
	const titleId = useId();
	const hasHeader = Boolean(title || subtitle || actions);

	return (
		<section
			aria-labelledby={title ? titleId : undefined}
			data-testid={testId}
			className={cn(
				'tw:flex tw:min-w-0 tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:text-foreground',
				className,
			)}
		>
			{hasHeader && (
				<div
					data-testid="panel-header"
					className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-3 tw:gap-y-2 tw:px-5 tw:py-3 tw:font-sans"
				>
					<div className="tw:min-w-0">
						{title && (
							<h2
								id={titleId}
								className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold"
							>
								{title}
							</h2>
						)}
						{subtitle && (
							<p className="tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
								{subtitle}
							</p>
						)}
					</div>
					{actions && (
						<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
							{actions}
						</div>
					)}
				</div>
			)}
			<div
				className={cn(
					'tw:relative tw:min-w-0 tw:flex-1',
					divided && hasHeader && 'tw:border-t tw:border-border',
					bodyClassName,
				)}
			>
				{children}
			</div>
			{footer && (
				<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:px-5 tw:py-2.5 tw:font-sans tw:text-xs tw:text-subtle-foreground">
					{footer}
				</div>
			)}
		</section>
	);
}

export default ContentPanel;
