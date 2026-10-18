import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface IntegrationCardProps {
	icon: string;
	iconAlt: string;
	title: string;
	subtitle?: ReactNode;
	description?: ReactNode;
	badge?: ReactNode;
	footer?: ReactNode;
	onClick: () => void;
	className?: string;
	testId?: string;
}

function IntegrationCard({
	icon,
	iconAlt,
	title,
	subtitle,
	description,
	badge,
	footer,
	onClick,
	className,
	testId,
}: IntegrationCardProps): JSX.Element {
	return (
		<button
			type="button"
			data-testid={testId}
			onClick={onClick}
			className={cn(
				'tw:flex tw:min-w-0 tw:cursor-pointer tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-4 tw:text-left tw:text-foreground tw:transition-colors tw:hover:border-primary tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none',
				className,
			)}
		>
			<span className="tw:flex tw:w-full tw:items-center tw:gap-3">
				<span className="tw:flex tw:size-10 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-border tw:bg-muted">
					<img src={icon} alt={iconAlt} className="tw:size-6 tw:object-contain" />
				</span>
				<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-snug">
					<span className="tw:truncate tw:text-sm tw:font-semibold">{title}</span>
					{subtitle && (
						<span className="tw:truncate tw:text-xs tw:text-subtle-foreground">
							{subtitle}
						</span>
					)}
				</span>
				{badge}
			</span>
			{description && (
				<span className="tw:text-[13px] tw:text-muted-foreground">
					{description}
				</span>
			)}
			{footer && <span className="tw:flex tw:items-center">{footer}</span>}
		</button>
	);
}

export default IntegrationCard;
