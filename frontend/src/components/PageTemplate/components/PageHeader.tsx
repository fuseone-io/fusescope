import { ReactNode } from 'react';
import { cn } from 'lib/utils';

import { PageHeaderMetaItem } from '../types';

interface PageHeaderProps {
	title: ReactNode;
	/** Entity names (services, hosts…) read better in the mono face. */
	titleMono?: boolean;
	icon?: ReactNode;
	badges?: ReactNode;
	description?: ReactNode;
	meta?: PageHeaderMetaItem[];
	actions?: ReactNode;
	testId?: string;
	className?: string;
}

function PageHeader({
	title,
	titleMono = false,
	icon,
	badges,
	description,
	meta,
	actions,
	testId = 'page-header',
	className,
}: PageHeaderProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'fs-ui tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4 tw:font-sans tw:text-foreground',
				className,
			)}
		>
			<div className="tw:flex tw:min-w-0 tw:items-start tw:gap-4">
				{icon && (
					<span
						aria-hidden="true"
						className="tw:flex tw:size-12 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink tw:[&_svg:not([class*=size-])]:size-6"
					>
						{icon}
					</span>
				)}
				<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
					<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-3">
						<h1
							className={cn(
								'tw:min-w-0 tw:truncate tw:text-2xl tw:leading-tight',
								titleMono
									? 'tw:font-mono tw:font-medium tw:tracking-[-0.02em]'
									: 'tw:font-semibold tw:tracking-[-0.025em]',
							)}
						>
							{title}
						</h1>
						{badges}
					</div>
					{description && (
						<p className="tw:text-sm tw:text-muted-foreground">{description}</p>
					)}
					{meta && meta.length > 0 && (
						<ul
							data-testid="page-header-meta"
							className="tw:flex tw:flex-wrap tw:gap-x-[18px] tw:gap-y-1.5"
						>
							{meta.map((item) => (
								<li
									key={item.key}
									className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-muted-foreground"
								>
									{item.content}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
			{actions && (
				<div
					data-testid="page-header-actions"
					className="tw:flex tw:flex-wrap tw:items-center tw:gap-2"
				>
					{actions}
				</div>
			)}
		</div>
	);
}

export default PageHeader;
