import { ChangeEvent, useState } from 'react';
import HavingFilter from 'components/QueryBuilderV2/QueryV2/QueryAddOns/HavingFilter/HavingFilter';
import { OrderByFilter } from 'container/QueryBuilder/filters/OrderByFilter/OrderByFilter';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

/**
 * Having, Order by, Limit and Legend, always shown. They call the same
 * handlers as the builder's add-ons; an empty field leaves the query as an
 * add-on that was never opened does.
 */
function ResultFields({
	query,
	index,
}: {
	query: IBuilderQuery;
	index: number;
}): JSX.Element {
	const { handleChangeQueryData } = useQueryOperations({
		index,
		query,
		entityVersion: '',
	});
	const [limit, setLimit] = useState(query.limit ? String(query.limit) : '');
	const [legend, setLegend] = useState(query.legend ?? '');

	return (
		<div className="egrid sm">
			<div className="field qp-having">
				<span className="flabel">Having</span>
				<HavingFilter
					onClose={(): void => undefined}
					onChange={(value): void =>
						handleChangeQueryData('having', { expression: value })
					}
					queryData={query}
					placeholder="value > 5"
				/>
			</div>
			<div className="field">
				<span className="flabel">Order by</span>
				<div className="qp-sel">
					<OrderByFilter
						entityVersion="v3"
						query={query}
						onChange={(value): void => handleChangeQueryData('orderBy', value)}
						isRawQuery={false}
						isNewQueryV2
						placeholder="Order by"
					/>
				</div>
			</div>
			<label className="field">
				<span className="flabel">Limit</span>
				<input
					className="inp num"
					type="number"
					placeholder="No limit"
					data-testid="query-limit"
					value={limit}
					onChange={(event: ChangeEvent<HTMLInputElement>): void => {
						setLimit(event.target.value);
						handleChangeQueryData('limit', Number(event.target.value) || null);
					}}
				/>
			</label>
			<label className="field">
				<span className="flabel">Legend</span>
				<input
					className="inp"
					placeholder="{{service.name}}"
					data-testid="query-legend"
					value={legend}
					onChange={(event: ChangeEvent<HTMLInputElement>): void => {
						setLegend(event.target.value);
						handleChangeQueryData('legend', event.target.value);
					}}
				/>
			</label>
		</div>
	);
}

export default ResultFields;
