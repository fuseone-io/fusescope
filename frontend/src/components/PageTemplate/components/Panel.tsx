import { ReactNode, useId } from 'react';
import { cn } from 'lib/utils';

interface PanelProps {
	title?: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	testId?: string;
	className?: string;
	bodyClassName?: string;
}

/**
 * A raised, bordered section. The header carries `fs-ui`; the body doesn't,
 * so legacy widgets (charts, antd tables) placed in it keep their own styles.
 */
function Panel({
	title,
	subtitle,
	actions,
	children,
	testId,
	className,
	bodyClassName,
}: PanelProps): JSX.Element {
	const titleId = useId();
	const hasHeader = Boolean(title || subtitle || actions);

	return (
		<section
			aria-labelledby={title ? titleId : undefined}
			data-testid={testId}
			className={cn(
				'tw:flex tw:min-w-0 tw:flex-col tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:text-foreground',
				className,
			)}
		>
			{hasHeader && (
				<div
					data-testid="panel-header"
					className="fs-ui tw:flex tw:items-start tw:justify-between tw:gap-3 tw:px-5 tw:pt-4 tw:font-sans"
				>
					<div className="tw:min-w-0">
						{title && (
							<h2 id={titleId} className="tw:text-sm tw:font-semibold">
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
			<div className={cn('tw:relative tw:min-w-0 tw:flex-1', bodyClassName)}>
				{children}
			</div>
		</section>
	);
}

export default Panel;
