function Header(): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-0.5 tw:font-sans">
			<h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-foreground">
				Funnels
			</h2>
			<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
				Create and manage tracing funnels.
			</p>
		</div>
	);
}

export default Header;
