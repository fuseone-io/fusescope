import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface CardHeadProps {
	letter: string;
	isFormula?: boolean;
	title: string;
	/** Shown under the title while the card is collapsed. */
	summary: string;
	isOpen: boolean;
	isHidden: boolean;
	onToggleOpen: () => void;
	onToggleVisibility: () => void;
	actions: ReactNode;
}

/** Chevron, letter, title and summary, then visibility and the card's menu. */
function CardHead({
	letter,
	isFormula = false,
	title,
	summary,
	isOpen,
	isHidden,
	onToggleOpen,
	onToggleVisibility,
	actions,
}: CardHeadProps): JSX.Element {
	return (
		<div className="qhead fs-ui">
			<Button
				variant="ghost"
				size="icon-sm"
				className="tw:size-7 tw:text-muted-foreground"
				aria-expanded={isOpen}
				aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${letter}`}
				data-testid={`query-card-toggle-${letter}`}
				onClick={onToggleOpen}
			>
				{isOpen ? <ChevronDown /> : <ChevronRight />}
			</Button>
			<span className={cn('qa', isFormula && 'f')}>{letter}</span>
			<span className="qtitle">
				<span className="qtitle-text">{title}</span>
				{summary && (
					<span className="qsum" title={summary}>
						{summary}
					</span>
				)}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				className="tw:size-7 tw:text-muted-foreground"
				aria-label={`${isHidden ? 'Show' : 'Hide'} ${letter}`}
				aria-pressed={isHidden}
				onClick={onToggleVisibility}
			>
				{isHidden ? <EyeOff /> : <Eye />}
			</Button>
			{actions}
		</div>
	);
}

export default CardHead;
