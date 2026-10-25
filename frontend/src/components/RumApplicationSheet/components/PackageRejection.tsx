interface PackageRejectionProps {
	requests: string;
	/** The refused app.package.name, empty when the resource had none. */
	packageName: string;
}

function PackageRejection({
	requests,
	packageName,
}: PackageRejectionProps): JSX.Element {
	if (!packageName) {
		return (
			<span className="translate-safe">
				{`${requests}: no `}
				<span className="tw:font-mono">app.package.name</span> in the resource.
			</span>
		);
	}
	return (
		<span className="translate-safe">
			{`${requests}: package `}
			<span className="tw:font-mono">{packageName}</span> is not allowed.
		</span>
	);
}

export default PackageRejection;
