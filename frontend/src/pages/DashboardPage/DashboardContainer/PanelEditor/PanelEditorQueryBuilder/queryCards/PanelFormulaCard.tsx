import type { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import CardHead from 'container/MetricsExplorer/Explorer/QueryPanel/CardHead';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { cn } from 'lib/utils';
import { Trash2 } from 'lucide-react';
import type { IBuilderFormula } from 'types/api/queryBuilder/queryBuilderData';

interface PanelFormulaCardProps {
	formula: IBuilderFormula;
	index: number;
	/** The builder's own formula editor; its header row is replaced by the card's. */
	editor: ReactNode;
	isOpen: boolean;
	onToggleOpen: () => void;
}

/** A formula as a card around the builder's own formula editor. */
function PanelFormulaCard({
	formula,
	index,
	editor,
	isOpen,
	onToggleOpen,
}: PanelFormulaCardProps): JSX.Element {
	const { handleSetFormulaData, removeQueryBuilderEntityByIndex } =
		useQueryBuilder();

	return (
		<div
			className={cn('qcard pq-formula', formula.disabled && 'off')}
			data-testid={`query-card-${formula.queryName}`}
		>
			<CardHead
				letter={formula.queryName}
				isFormula
				title="Formula"
				summary={isOpen ? '' : formula.expression}
				isOpen={isOpen}
				isHidden={Boolean(formula.disabled)}
				onToggleOpen={onToggleOpen}
				onToggleVisibility={(): void =>
					handleSetFormulaData(index, { ...formula, disabled: !formula.disabled })
				}
				actions={
					<Button
						variant="ghost"
						size="icon-sm"
						className="tw:size-7 tw:text-muted-foreground"
						aria-label={`Delete ${formula.queryName}`}
						onClick={(): void =>
							removeQueryBuilderEntityByIndex('queryFormulas', index)
						}
					>
						<Trash2 />
					</Button>
				}
			/>
			{isOpen && <div className="qbody">{editor}</div>}
		</div>
	);
}

export default PanelFormulaCard;
