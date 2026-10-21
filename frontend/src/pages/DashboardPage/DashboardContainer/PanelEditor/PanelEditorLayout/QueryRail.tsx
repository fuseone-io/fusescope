import { Button } from 'components/ui/button';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { getQueryMode } from 'lib/query/queryMode';
import { cn } from 'lib/utils';
import { PanelLeftOpen, Play } from 'lucide-react';
import { QueryMode } from 'types/api/queryBuilder/queryBuilderData';

interface QueryRailProps {
	onExpand: () => void;
	/** Open the panel on this query's card. */
	onOpenQuery: (name: string) => void;
	onRun?: () => void;
}

/** The collapsed query panel: a letter per query, opening its card. */
function QueryRail({
	onExpand,
	onOpenQuery,
	onRun,
}: QueryRailProps): JSX.Element {
	const { currentQuery } = useQueryBuilder();
	const mode = getQueryMode(currentQuery);

	let letters: { name: string; isFormula: boolean }[];
	if (mode === QueryMode.CLICKHOUSE) {
		letters = currentQuery.clickhouse_sql.map(({ name }) => ({
			name,
			isFormula: false,
		}));
	} else if (mode === QueryMode.PROM) {
		letters = currentQuery.promql.map(({ name }) => ({ name, isFormula: false }));
	} else {
		letters = [
			...currentQuery.builder.queryData.map(({ queryName }) => ({
				name: queryName,
				isFormula: false,
			})),
			...currentQuery.builder.queryFormulas.map(({ queryName }) => ({
				name: queryName,
				isFormula: true,
			})),
		];
	}

	return (
		<nav
			className="rail fs-ui"
			aria-label="Queries (collapsed)"
			data-testid="panel-editor-query-rail"
		>
			<Button
				variant="ghost"
				size="icon-sm"
				className="tw:text-muted-foreground"
				aria-label="Expand query panel"
				onClick={onExpand}
			>
				<PanelLeftOpen />
			</Button>
			{letters.map((letter) => (
				<button
					key={letter.name}
					type="button"
					className="rail-item"
					aria-label={`Open ${letter.name}`}
					onClick={(): void => onOpenQuery(letter.name)}
				>
					<span className={cn('qa', letter.isFormula && 'f')}>{letter.name}</span>
				</button>
			))}
			{onRun && (
				<Button
					variant="ghost"
					size="icon-sm"
					className="tw:mt-2 tw:text-primary"
					aria-label="Run query"
					title="Run query ⌘↵"
					onClick={onRun}
				>
					<Play />
				</Button>
			)}
		</nav>
	);
}

export default QueryRail;
