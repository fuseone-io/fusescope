interface SectionLabelProps {
	children: string;
}

function SectionLabel({ children }: SectionLabelProps): JSX.Element {
	return (
		<div className="tw:flex tw:items-center tw:gap-3">
			<h2 className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				{children}
			</h2>
			<span aria-hidden="true" className="tw:h-px tw:flex-1 tw:bg-border" />
		</div>
	);
}

export default SectionLabel;
