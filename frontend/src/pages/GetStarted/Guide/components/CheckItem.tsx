import { cn } from 'lib/utils';
import { Check } from 'lucide-react';

interface CheckItemProps {
	done: boolean;
	label: string;
}

function CheckItem({ done, label }: CheckItemProps): JSX.Element {
	return (
		<span className="tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
			<span
				aria-hidden="true"
				className={cn(
					'tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full',
					done
						? 'tw:bg-success-soft tw:text-success-ink'
						: 'tw:border tw:border-dashed tw:border-input',
				)}
			>
				{done && <Check className="tw:size-3" />}
			</span>
			{label}
		</span>
	);
}

export default CheckItem;
