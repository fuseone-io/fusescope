import { Skeleton } from 'components/ui/skeleton';
import { TableCell, TableRow } from 'components/ui/table';

interface ConfigListSkeletonProps {
	colSpan: number;
	rows?: number;
}

/** Placeholder rows while a configuration list loads. */
function ConfigListSkeleton({
	colSpan,
	rows = 3,
}: ConfigListSkeletonProps): JSX.Element {
	return (
		<>
			{Array.from({ length: rows }, (_, index) => (
				<TableRow
					key={index}
					data-testid="config-list-skeleton"
					className="tw:hover:bg-transparent"
				>
					<TableCell colSpan={colSpan} className="tw:h-14">
						<Skeleton className="tw:h-4 tw:w-full tw:max-w-xl" />
					</TableCell>
				</TableRow>
			))}
		</>
	);
}

export default ConfigListSkeleton;
