import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface GuideStepProps {
	number: number;
	id: string;
	title: string;
	done: boolean;
	description?: ReactNode;
	children: ReactNode;
}

function GuideStep({
	number,
	id,
	title,
	done,
	description,
	children,
}: GuideStepProps): JSX.Element {
	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			className="tw:grid tw:scroll-mt-4 tw:grid-cols-[28px_minmax(0,1fr)] tw:gap-x-3.5 tw:gap-y-1 tw:border-t tw:border-border tw:p-5 tw:first:border-t-0"
		>
			<span
				aria-hidden="true"
				className={cn(
					'tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:border tw:text-[13px] tw:font-semibold',
					done
						? 'tw:border-success tw:bg-success-soft tw:text-success-ink'
						: 'tw:border-input tw:text-muted-foreground',
				)}
			>
				{number}
			</span>
			<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-3">
				<div className="tw:flex tw:min-h-7 tw:flex-col tw:justify-center tw:gap-0.5">
					<h2 id={`${id}-title`} className="tw:text-[15px] tw:font-semibold">
						{title}
					</h2>
					{description && (
						<p className="tw:text-[13px] tw:text-muted-foreground">{description}</p>
					)}
				</div>
				{children}
			</div>
		</section>
	);
}

export default GuideStep;
