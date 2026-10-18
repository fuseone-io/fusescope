import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { Button } from 'components/ui/button';
import { ChevronDown } from 'lucide-react';

const FilterTrigger = forwardRef<
	HTMLButtonElement,
	{ label: string } & ComponentPropsWithoutRef<'button'>
>(function FilterTrigger({ label, ...props }, ref): JSX.Element {
	return (
		<Button
			ref={ref}
			variant="outline"
			className="tw:bg-surface-raised tw:font-normal tw:dark:bg-surface-raised"
			{...props}
		>
			<span>{label}</span>
			<ChevronDown aria-hidden="true" className="tw:text-subtle-foreground" />
		</Button>
	);
});

export default FilterTrigger;
