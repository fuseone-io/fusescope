import { ChangeEvent, useCallback, useMemo, useState } from 'react';
import { Select } from 'antd';
import { Button } from 'components/ui/button';
import { LEGEND } from 'constants/global';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { cn } from 'lib/utils';
import { Trash2 } from 'lucide-react';
import {
	IBuilderFormula,
	IBuilderQuery,
	OrderByPayload,
} from 'types/api/queryBuilder/queryBuilderData';
import { getFormatedLegend } from 'utils/getFormatedLegend';

import CardHead from './CardHead';
import EditorActions from './EditorActions';

interface FormulaCardProps {
	formula: IBuilderFormula;
	query: IBuilderQuery;
	index: number;
	isOpen: boolean;
	editorKey: number;
	onToggleOpen: () => void;
	onReset: () => void;
}

/** A formula card: its expression, then the same result options as the builder. */
function FormulaCard({
	formula,
	query,
	index,
	isOpen,
	editorKey,
	onToggleOpen,
	onReset,
}: FormulaCardProps): JSX.Element {
	const { handleSetFormulaData, removeQueryBuilderEntityByIndex } =
		useQueryBuilder();
	const { handleChangeFormulaData } = useQueryOperations({
		index,
		query,
		formula,
		entityVersion: '',
	});
	const [limit, setLimit] = useState(formula.limit ? String(formula.limit) : '');

	// The builder's formula handler: legend values are normalised.
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>): void => {
			const { name, value } = event.target;
			handleSetFormulaData(index, {
				...formula,
				[name]: name === LEGEND ? getFormatedLegend(value) : value,
			});
		},
		[index, formula, handleSetFormulaData],
	);

	const orderByOptions = useMemo(
		() => [
			{ label: `${formula.queryName} asc`, value: `${formula.queryName} asc` },
			{ label: `${formula.queryName} desc`, value: `${formula.queryName} desc` },
		],
		[formula.queryName],
	);
	const orderByValue = formula.orderBy?.length
		? `${formula.orderBy[0].columnName} ${formula.orderBy[0].order}`
		: undefined;

	return (
		<div
			className={cn('qcard', formula.disabled && 'off')}
			data-testid={`query-card-${formula.queryName}`}
		>
			<CardHead
				letter={formula.queryName}
				isFormula
				title="Formula"
				summary={isOpen ? '' : formula.expression}
				isOpen={isOpen}
				isHidden={formula.disabled}
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
			{isOpen && (
				<div className="qbody" key={editorKey}>
					<label className="field">
						<span className="flabel">
							Expression <span className="fhint">reference queries by letter</span>
						</span>
						<span className="where">
							<span className="kw">=</span>
							<input
								name="expression"
								aria-label={`Formula ${formula.queryName} expression`}
								value={formula.expression}
								placeholder="Enter formula"
								onChange={handleChange}
							/>
						</span>
					</label>
					<div className="qsec">
						<span className="esec">Result</span>
						<div className="egrid sm">
							<div className="field">
								<span className="flabel">Order by</span>
								<div className="qp-sel">
									<Select
										showSearch
										filterOption={false}
										placeholder="Order by"
										options={orderByOptions}
										onChange={(value: string): void => {
											const [columnName, order] = value.split(' ');
											const next: OrderByPayload[] = [{ columnName, order }];
											handleChangeFormulaData('orderBy', next);
										}}
										value={orderByValue}
										style={{ width: '100%' }}
									/>
								</div>
							</div>
							<label className="field">
								<span className="flabel">Limit</span>
								<input
									className="inp num"
									type="number"
									placeholder="No limit"
									value={limit}
									onChange={(event): void => {
										setLimit(event.target.value);
										handleChangeFormulaData('limit', Number(event.target.value));
									}}
								/>
							</label>
							<label className="field">
								<span className="flabel">Legend</span>
								<input
									className="inp"
									name="legend"
									placeholder="{{service.name}}"
									value={formula.legend}
									onChange={handleChange}
								/>
							</label>
						</div>
					</div>
					<EditorActions
						letter={formula.queryName}
						onReset={onReset}
						onDone={onToggleOpen}
					/>
				</div>
			)}
		</div>
	);
}

export default FormulaCard;
