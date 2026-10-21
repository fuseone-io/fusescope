import React from 'react';
import { cn } from 'lib/utils';
import { ChevronDownIcon } from 'lucide-react';

const NativeSelect = React.forwardRef<
	HTMLSelectElement,
	React.ComponentPropsWithoutRef<'select'> & { wrapperClassName?: string }
>(function NativeSelect(
	{ className, wrapperClassName, ...props },
	ref,
): JSX.Element {
	return (
		<div
			data-slot="native-select-wrapper"
			className={cn(
				'tw:relative tw:w-fit tw:has-[select:disabled]:opacity-50',
				wrapperClassName,
			)}
		>
			<select
				ref={ref}
				data-slot="native-select"
				className={cn(
					'tw:h-9 tw:w-full tw:min-w-0 tw:cursor-pointer tw:appearance-none tw:rounded-md tw:border tw:border-input tw:bg-surface-raised tw:py-1 tw:pr-8 tw:pl-3 tw:font-sans tw:text-sm tw:text-foreground tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed',
					'tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50',
					'tw:aria-invalid:border-destructive tw:aria-invalid:ring-destructive/20',
					className,
				)}
				{...props}
			/>
			<ChevronDownIcon
				aria-hidden="true"
				className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-2.5 tw:size-4 tw:-translate-y-1/2 tw:text-muted-foreground"
			/>
		</div>
	);
});

function NativeSelectOption(
	props: React.ComponentProps<'option'>,
): JSX.Element {
	return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
