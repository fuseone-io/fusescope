import { ReactNode } from 'react';
import { Badge } from 'components/ui/badge';

function ChipFrame({ children }: { children: ReactNode }): JSX.Element {
	return (
		<Badge
			variant="secondary"
			className="tw:h-6 tw:max-w-full tw:gap-1.5 tw:rounded-sm tw:border-border tw:px-2 tw:font-normal"
		>
			{children}
		</Badge>
	);
}

export default ChipFrame;
