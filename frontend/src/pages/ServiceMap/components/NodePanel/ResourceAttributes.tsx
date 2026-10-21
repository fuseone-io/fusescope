interface ResourceAttributesProps {
	attributes: [string, string[]][];
}

function ResourceAttributes({
	attributes,
}: ResourceAttributesProps): JSX.Element {
	if (attributes.length === 0) {
		return (
			<span className="tw:text-xs tw:text-subtle-foreground">
				No resource attributes in this range.
			</span>
		);
	}
	return (
		<dl className="tw:grid tw:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] tw:gap-x-3 tw:gap-y-1.5 tw:font-mono tw:text-[11.5px]">
			{attributes.map(([key, values]) => (
				<div key={key} className="tw:contents">
					<dt title={key} className="tw:truncate tw:text-subtle-foreground">
						{key}
					</dt>
					<dd title={values.join(', ')} className="tw:truncate tw:text-foreground">
						{values.join(', ')}
					</dd>
				</div>
			))}
		</dl>
	);
}

export default ResourceAttributes;
