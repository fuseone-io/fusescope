import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';

interface ErrorAttributesTableProps {
	rows: { key: string; value: string }[];
}

function ErrorAttributesTable({
	rows,
}: ErrorAttributesTableProps): JSX.Element {
	return (
		<Table className="tw:table-fixed">
			<TableHeader className="tw:bg-surface-sunken">
				<TableRow>
					<TableHead className="tw:w-[30%]">Key</TableHead>
					<TableHead>Value</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.key} data-testid="error-attribute-row">
						<TableCell className="tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground">
							{row.key}
						</TableCell>
						<TableCell className="tw:font-mono tw:text-xs tw:break-all tw:whitespace-normal">
							{row.value}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export default ErrorAttributesTable;
