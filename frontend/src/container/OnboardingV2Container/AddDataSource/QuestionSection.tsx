import { forwardRef, ReactNode } from 'react';
import { DOCS_BASE_URL } from 'constants/docs';
import { cn } from 'lib/utils';
import { Check } from 'lucide-react';

interface QuestionSectionProps {
	step: number;
	answered: boolean;
	title: string;
	helpText?: string;
	helpLink?: string;
	helpLinkText?: string;
	children: ReactNode;
}

const QuestionSection = forwardRef<HTMLDivElement, QuestionSectionProps>(
	function QuestionSection(
		{ step, answered, title, helpText, helpLink, helpLinkText, children },
		ref,
	): JSX.Element {
		return (
			<section
				ref={ref}
				className="fs-ui tw:min-h-[80vh] tw:scroll-mt-32 tw:border-t tw:border-border tw:pt-8 tw:font-sans"
			>
				<div className="tw:mb-5 tw:flex tw:items-start tw:gap-3">
					<span
						aria-hidden
						className={cn(
							'tw:mt-0.5 tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border tw:text-xs tw:font-semibold',
							answered
								? 'tw:border-primary tw:bg-primary-soft tw:text-primary-ink'
								: 'tw:border-border tw:bg-surface-raised tw:text-muted-foreground',
						)}
					>
						{answered ? <Check className="tw:size-3.5" /> : step}
					</span>
					<div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
						<h2 className="tw:text-lg tw:font-semibold tw:text-foreground">
							{title}
						</h2>
						{helpText && (
							<p className="tw:text-sm tw:text-muted-foreground">
								{helpText}
								{helpLink && (
									<a
										href={`${DOCS_BASE_URL}${helpLink}`}
										target="_blank"
										rel="noopener noreferrer"
										className="tw:ml-1 tw:font-medium tw:text-primary-ink! tw:hover:underline"
									>
										{helpLinkText || 'Learn more →'}
									</a>
								)}
							</p>
						)}
					</div>
				</div>
				<div className="tw:flex tw:flex-wrap tw:gap-2 tw:pl-10">{children}</div>
			</section>
		);
	},
);

export default QuestionSection;
