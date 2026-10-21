import { useGetAllIntegrations } from 'hooks/Integrations/useGetAllIntegrations';

/** "8 integrations · 2 installed", once the list has loaded. */
function IntegrationsCountMeta(): JSX.Element | null {
	const { data } = useGetAllIntegrations();
	const integrations = data?.data.data.integrations;
	if (!integrations) {
		return null;
	}
	const installed = integrations.filter((item) => item.is_installed).length;

	return (
		<>
			<strong
				data-testid="integrations-count"
				className="tw:font-medium tw:text-foreground"
			>
				{integrations.length}
			</strong>{' '}
			integrations ·{' '}
			<strong
				data-testid="integrations-installed-count"
				className="tw:font-medium tw:text-foreground"
			>
				{installed}
			</strong>{' '}
			installed
		</>
	);
}

export default IntegrationsCountMeta;
