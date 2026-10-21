import { useCopyToClipboard } from 'react-use';
import { Button } from 'components/ui/button';
import { Copy } from 'lucide-react';

interface ErrorAttributesTableProps {
	rows: { key: string; value: string }[];
}

/** The event's remaining fields as key and value rows, each value copyable. */
function ErrorAttributesTable({
	rows,
}: ErrorAttributesTableProps): JSX.Element {
	const [, copyToClipboard] = useCopyToClipboard();

	return (
		<dl className="fs-ui tw:m-0 tw:font-sans">
			{rows.map((row) => (
				<div
					key={row.key}
					data-testid="error-attribute-row"
					className="tw:group tw:grid tw:grid-cols-[minmax(140px,30%)_1fr] tw:items-start tw:gap-3 tw:border-b tw:border-border tw:px-5 tw:py-2 tw:last:border-b-0 tw:hover:bg-surface-sunken"
				>
					<dt className="tw:truncate tw:pt-0.5 tw:font-mono tw:text-xs tw:text-muted-foreground">
						{row.key}
					</dt>
					<dd className="tw:m-0 tw:flex tw:min-w-0 tw:items-start tw:justify-between tw:gap-2">
						<span className="tw:min-w-0 tw:pt-0.5 tw:font-mono tw:text-xs tw:break-all tw:[font-variant-ligatures:none]">
							{row.value}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={`Copy ${row.key}`}
							onClick={(): void => copyToClipboard(String(row.value))}
							className="tw:flex-none tw:opacity-0 tw:group-hover:opacity-100 tw:focus-visible:opacity-100"
						>
							<Copy />
						</Button>
					</dd>
				</div>
			))}
		</dl>
	);
}

export default ErrorAttributesTable;
