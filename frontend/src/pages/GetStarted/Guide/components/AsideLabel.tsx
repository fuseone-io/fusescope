function AsideLabel({ children }: { children: string }): JSX.Element {
	return (
		<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
			{children}
		</span>
	);
}

export default AsideLabel;
