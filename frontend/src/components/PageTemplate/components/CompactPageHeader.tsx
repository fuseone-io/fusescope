import { ReactNode } from 'react';
import { cn } from 'lib/utils';

type IconTone = 'primary' | 'error';

const ICON_TONE_CLASSES: Record<IconTone, string> = {
	primary: 'tw:bg-primary-soft tw:text-primary-ink',
	error: 'tw:bg-error-soft tw:text-error-ink',
};

interface CompactPageHeaderProps {
	title: ReactNode;
	titleMono?: boolean;
	icon?: ReactNode;
	iconTone?: IconTone;
	/** A one-line summary beside the title, e.g. counts in the time range. */
	meta?: ReactNode;
	actions?: ReactNode;
	testId?: string;
	className?: string;
}

/** The one-row header of explorer-style pages, where the content needs the height. */
function CompactPageHeader({
	title,
	titleMono = false,
	icon,
	iconTone = 'primary',
	meta,
	actions,
	testId = 'page-header',
	className,
}: CompactPageHeaderProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'fs-ui tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 tw:font-sans tw:text-foreground',
				className,
			)}
		>
			{icon && (
				<span
					aria-hidden="true"
					className={cn(
						'tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:[&_svg:not([class*=size-])]:size-[18px]',
						ICON_TONE_CLASSES[iconTone],
					)}
				>
					{icon}
				</span>
			)}
			<h1
				className={cn(
					'tw:min-w-0 tw:truncate tw:text-xl tw:leading-tight',
					titleMono
						? 'tw:font-mono tw:font-medium'
						: 'tw:font-semibold tw:tracking-[-0.01em]',
				)}
			>
				{title}
			</h1>
			{meta && (
				<span
					data-testid="page-header-meta"
					className="tw:min-w-0 tw:text-[13px] tw:text-muted-foreground tw:tabular-nums"
				>
					{meta}
				</span>
			)}
			{actions && (
				<div
					data-testid="page-header-actions"
					className="tw:ml-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2"
				>
					{actions}
				</div>
			)}
		</div>
	);
}

export default CompactPageHeader;
