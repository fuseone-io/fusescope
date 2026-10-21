import TanStackTable from 'components/TanStackTableView';

interface EntityNameCellProps {
	name: string;
	/** Where the resource runs, e.g. its node or namespace. */
	subtitle?: string;
}

/** A resource name in a list, with where it runs underneath. */
function EntityNameCell({ name, subtitle }: EntityNameCellProps): JSX.Element {
	return (
		<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-snug">
			<TanStackTable.Text className="tw:font-mono tw:text-primary-ink!">
				{name}
			</TanStackTable.Text>
			{subtitle && (
				<span className="tw:truncate tw:font-mono tw:text-[11px] tw:text-subtle-foreground">
					{subtitle}
				</span>
			)}
		</span>
	);
}

export default EntityNameCell;
