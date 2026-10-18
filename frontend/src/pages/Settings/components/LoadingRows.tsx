import { Skeleton } from 'components/ui/skeleton';
import { TableCell, TableRow } from 'components/ui/table';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

interface LoadingRowsProps {
	columns: number;
}

function LoadingRows({ columns }: LoadingRowsProps): JSX.Element {
	return (
		<>
			{ROWS.map((row) => (
				<TableRow key={row} data-testid="settings-row-loading">
					<TableCell colSpan={columns}>
						<Skeleton className="tw:h-5 tw:bg-muted" />
					</TableCell>
				</TableRow>
			))}
		</>
	);
}

export default LoadingRows;
