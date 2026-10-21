import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from 'lib/utils';

/** A bare button so a contributor cell can open the related-links popover. */
const ContributorCellTrigger = forwardRef<
	HTMLButtonElement,
	ComponentPropsWithoutRef<'button'>
>(function ContributorCellTrigger({ className, ...props }, ref): JSX.Element {
	return (
		<button
			ref={ref}
			type="button"
			className={cn(
				'tw:flex tw:w-full tw:min-w-0 tw:cursor-pointer tw:items-center tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:text-inherit tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:rounded-sm',
				className,
			)}
			{...props}
		/>
	);
});

export default ContributorCellTrigger;
