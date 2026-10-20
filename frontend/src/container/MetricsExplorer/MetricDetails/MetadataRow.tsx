import { ReactNode } from 'react';

/** A label and its value on one 140px-keyed row of the metadata panel. */
function MetadataRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<div className="tw:grid tw:min-h-10 tw:grid-cols-[140px_minmax(0,1fr)] tw:items-center tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-1.5 tw:text-[13px] tw:last:border-b-0">
			<span className="tw:text-muted-foreground">{label}</span>
			<div className="tw:min-w-0">{children}</div>
		</div>
	);
}

export default MetadataRow;
