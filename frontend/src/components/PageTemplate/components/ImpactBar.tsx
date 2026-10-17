interface ImpactBarProps {
	/** Share in percent, 0–100. */
	value: number;
	/** Hover text; the bar itself is decorative next to the number it draws. */
	label: string;
}

function ImpactBar({ value, label }: ImpactBarProps): JSX.Element {
	const width = Math.min(100, Math.max(0, value));

	return (
		<span
			aria-hidden="true"
			title={label}
			data-testid="impact-bar"
			className="tw:block tw:h-1.5 tw:w-full tw:min-w-12 tw:overflow-hidden tw:rounded-full tw:bg-muted"
		>
			<span
				className="tw:block tw:h-full tw:rounded-full tw:bg-primary"
				style={{ width: `${width}%` }}
			/>
		</span>
	);
}

export default ImpactBar;
