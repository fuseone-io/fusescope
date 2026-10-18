import { ReactNode, useId } from 'react';
import { Skeleton } from 'components/ui/skeleton';
import { cn } from 'lib/utils';

export type SystemPagePanelTone = 'primary' | 'neutral' | 'warning' | 'error';

const TONE_CLASSES: Record<SystemPagePanelTone, string> = {
	primary: 'tw:bg-primary-soft tw:text-primary-ink',
	neutral: 'tw:bg-muted tw:text-muted-foreground',
	warning: 'tw:bg-warning-soft tw:text-warning-ink',
	error: 'tw:bg-error-soft tw:text-error-ink',
};

interface SystemPagePanelProps {
	icon: ReactNode;
	tone?: SystemPagePanelTone;
	title: ReactNode;
	/** Small uppercase label above the title. */
	eyebrow?: ReactNode;
	description?: ReactNode;
	/** Details between the description and the actions; not `fs-ui` scoped. */
	children?: ReactNode;
	actions?: ReactNode;
	/** Secondary row under a rule at the bottom of the card. */
	footer?: ReactNode;
	/** Sections under the card, in a wider column; not `fs-ui` scoped. */
	extra?: ReactNode;
	/** Swaps the title, description and actions for placeholders. */
	loading?: boolean;
	testId?: string;
	className?: string;
}

/**
 * A card centred in the page for system screens (not found, errors, locked
 * workspaces). Legacy widgets may be passed as `children`, `footer` children
 * or `extra`, so only the panel's own markup carries `fs-ui`.
 */
function SystemPagePanel({
	icon,
	tone = 'primary',
	title,
	eyebrow,
	description,
	children,
	actions,
	footer,
	extra,
	loading = false,
	testId,
	className,
}: SystemPagePanelProps): JSX.Element {
	const titleId = useId();

	return (
		<div
			data-testid={testId}
			className={cn(
				'tw:box-border tw:flex tw:min-h-full tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-6 tw:bg-background tw:p-4 tw:text-foreground tw:md:p-8',
				className,
			)}
		>
			<section
				aria-labelledby={loading ? undefined : titleId}
				aria-busy={loading || undefined}
				className="tw:box-border tw:flex tw:w-full tw:max-w-[540px] tw:flex-col tw:gap-6 tw:rounded-xl tw:border tw:border-solid tw:border-border tw:bg-surface-raised tw:p-8 tw:text-center"
			>
				<div className="fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:font-sans">
					<span
						aria-hidden="true"
						className={cn(
							'tw:flex tw:size-12 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:[&_svg:not([class*=size-])]:size-6',
							TONE_CLASSES[tone],
						)}
					>
						{icon}
					</span>
					{loading ? (
						<div
							data-testid="system-page-panel-loading"
							className="tw:flex tw:w-full tw:flex-col tw:items-center tw:gap-3 tw:pt-1"
						>
							<Skeleton className="tw:h-6 tw:w-1/2" />
							<Skeleton className="tw:h-4 tw:w-4/5" />
							<Skeleton className="tw:h-4 tw:w-3/5" />
						</div>
					) : (
						<>
							{eyebrow && (
								<p className="tw:text-xs tw:font-medium tw:tracking-wider tw:text-muted-foreground tw:uppercase">
									{eyebrow}
								</p>
							)}
							<h1
								id={titleId}
								className="tw:text-xl tw:leading-tight tw:font-semibold tw:tracking-[-0.02em]"
							>
								{title}
							</h1>
							{description && (
								<div className="tw:text-sm tw:leading-relaxed tw:text-muted-foreground">
									{description}
								</div>
							)}
						</>
					)}
				</div>
				{!loading && children && <div className="tw:text-left">{children}</div>}
				{!loading && actions && (
					<div
						data-testid="system-page-panel-actions"
						className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-2 tw:font-sans"
					>
						{actions}
					</div>
				)}
				{footer && (
					<div className="fs-ui tw:-mx-8 tw:-mb-8 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-2 tw:border-t tw:border-solid tw:border-border tw:px-8 tw:py-4 tw:font-sans tw:text-sm tw:text-muted-foreground">
						{footer}
					</div>
				)}
			</section>
			{extra && <div className="tw:w-full tw:max-w-[880px]">{extra}</div>}
		</div>
	);
}

export default SystemPagePanel;
