import { Skeleton } from 'components/ui/skeleton';
import { TableCell, TableRow } from 'components/ui/table';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

function TimelineLoadingRows(): JSX.Element {
	return (
		<>
			{ROWS.map((row) => (
				<TableRow key={row} data-testid="timeline-row-loading">
					<TableCell colSpan={4}>
						<Skeleton className="tw:h-5 tw:bg-muted" />
					</TableCell>
				</TableRow>
			))}
		</>
	);
}

export default TimelineLoadingRows;
