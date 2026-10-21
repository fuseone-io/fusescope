import { ReactNode } from 'react';

interface ConfigDetailItemProps {
	title: string;
	value: ReactNode;
}

/** A label and value row of a configuration item's details; use inside a `<dl>`. */
function ConfigDetailItem({
	title,
	value,
}: ConfigDetailItemProps): JSX.Element {
	return (
		<div className="tw:grid tw:grid-cols-[128px_1fr] tw:items-start tw:gap-3">
			<dt className="tw:text-muted-foreground">{title}</dt>
			<dd className="tw:m-0 tw:min-w-0 tw:text-foreground">{value}</dd>
		</div>
	);
}

export default ConfigDetailItem;
