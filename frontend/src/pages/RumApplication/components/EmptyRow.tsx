import { ReactNode } from 'react';
import { TableCell, TableRow } from 'components/ui/table';

interface EmptyRowProps {
	columns: number;
	children: ReactNode;
}

function EmptyRow({ columns, children }: EmptyRowProps): JSX.Element {
	return (
		<TableRow className="tw:hover:bg-transparent">
			<TableCell
				colSpan={columns}
				className="tw:py-8 tw:text-center tw:text-[13px] tw:text-muted-foreground"
			>
				{children}
			</TableCell>
		</TableRow>
	);
}

export default EmptyRow;
