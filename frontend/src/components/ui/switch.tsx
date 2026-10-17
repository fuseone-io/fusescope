import React from 'react';
import { cn } from 'lib/utils';
import { Switch as SwitchPrimitive } from 'radix-ui';

const Switch = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
		size?: 'sm' | 'default';
	}
>(function Switch({ className, size = 'default', ...props }, ref): JSX.Element {
	return (
		<SwitchPrimitive.Root
			ref={ref}
			data-slot="switch"
			data-size={size}
			className={cn(
				'tw:peer tw:group/switch tw:inline-flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:rounded-full tw:border tw:border-transparent tw:shadow-xs tw:transition-all tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-[1.15rem] tw:data-[size=default]:w-8 tw:data-[size=sm]:h-3.5 tw:data-[size=sm]:w-6 tw:data-[state=checked]:bg-primary tw:data-[state=unchecked]:bg-input tw:dark:data-[state=unchecked]:bg-input/80',
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="tw:pointer-events-none tw:block tw:rounded-full tw:bg-background tw:ring-0 tw:transition-transform tw:group-data-[size=default]/switch:size-4 tw:group-data-[size=sm]/switch:size-3 tw:data-[state=checked]:translate-x-[calc(100%-2px)] tw:data-[state=unchecked]:translate-x-0 tw:dark:data-[state=checked]:bg-primary-foreground tw:dark:data-[state=unchecked]:bg-foreground"
			/>
		</SwitchPrimitive.Root>
	);
});

export { Switch };
