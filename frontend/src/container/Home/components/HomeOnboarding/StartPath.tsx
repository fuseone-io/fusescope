import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface StartPathProps {
	id: string;
	icon: LucideIcon;
	title: string;
	description: string;
	testId?: string;
	children: ReactNode;
}

/** One way to send a first signal, with its call to action. */
function StartPath({
	id,
	icon: Icon,
	title,
	description,
	testId,
	children,
}: StartPathProps): JSX.Element {
	return (
		<section
			aria-labelledby={`${id}-title`}
			data-testid={testId}
			className="tw:flex tw:min-w-0 tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-4"
		>
			<span
				aria-hidden="true"
				className="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
			>
				<Icon className="tw:size-4" />
			</span>
			<div className="tw:flex tw:flex-col tw:gap-0.5">
				<h3 id={`${id}-title`} className="tw:text-sm tw:font-semibold">
					{title}
				</h3>
				<p className="tw:text-[13px] tw:text-muted-foreground">{description}</p>
			</div>
			<div className="tw:mt-auto tw:flex tw:flex-wrap tw:gap-1.5">{children}</div>
		</section>
	);
}

export default StartPath;
