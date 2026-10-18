interface IntegrationsNotFoundProps {
	query: string;
}

function IntegrationsNotFound({
	query,
}: IntegrationsNotFoundProps): JSX.Element {
	return (
		<p className="tw:col-span-full tw:rounded-xl tw:border tw:border-dashed tw:border-border tw:px-5 tw:py-8 tw:text-center tw:text-sm tw:text-muted-foreground">
			No integrations found for &ldquo;{query}&rdquo;
		</p>
	);
}

export default IntegrationsNotFound;
