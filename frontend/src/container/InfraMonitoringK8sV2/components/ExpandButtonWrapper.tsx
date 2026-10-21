import { useEffect, useState } from 'react';
import { Button } from 'components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function ExpandButtonWrapper({
	toggleExpanded,
	isExpanded,
	children,
}: {
	toggleExpanded: () => void;
	isExpanded: boolean;
	children?: React.ReactNode;
}): JSX.Element {
	// the state is duplicated because it takes a few ms to propagate using isExpanded
	// so this local is used to avoid this delay
	const [localIsExpanded, setLocalIsExpanded] = useState(isExpanded);

	useEffect(() => {
		setLocalIsExpanded(isExpanded);
	}, [isExpanded]);

	return (
		<div className="fs-ui tw:flex tw:min-w-0 tw:items-center tw:gap-2">
			<Button
				aria-label={localIsExpanded ? 'Collapse' : 'Expand'}
				variant="ghost"
				size="icon-xs"
				className="tw:text-muted-foreground"
				onClick={(e): void => {
					e.stopPropagation();
					setLocalIsExpanded((v) => !v);
					toggleExpanded();
				}}
			>
				{localIsExpanded ? <ChevronDown /> : <ChevronRight />}
			</Button>
			{children}
		</div>
	);
}
