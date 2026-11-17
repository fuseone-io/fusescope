import { ConditionGroupProps } from './types';

function ConditionGroup({
	title,
	testId,
	children,
}: ConditionGroupProps): JSX.Element {
	return (
		<section
			aria-label={title}
			data-testid={testId}
			className="tw:flex tw:flex-col tw:gap-2"
		>
			<h4 className="fs-ui tw:m-0 tw:font-sans tw:text-xs tw:font-semibold tw:tracking-wide tw:text-foreground tw:uppercase">
				{title}
			</h4>
			<div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-3">
				{children}
			</div>
		</section>
	);
}

export default ConditionGroup;
