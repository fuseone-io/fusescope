import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { useServiceResources } from 'container/MetricsApplication/hooks/useServiceResources';

interface ServiceHeaderMetaProps {
	servicename: string;
	onOpenInfrastructure: () => void;
}

/** Environment, SDK language and host count beside the service name. */
function ServiceHeaderMeta({
	servicename,
	onOpenInfrastructure,
}: ServiceHeaderMetaProps): JSX.Element | null {
	const { environments, languages, hosts, isLoading } =
		useServiceResources(servicename);
	if (isLoading) {
		return null;
	}
	return (
		<span className="tw:inline-flex tw:flex-wrap tw:items-center tw:gap-2">
			{environments.map((environment) => (
				<span
					key={environment}
					title="deployment.environment"
					className="tw:inline-flex"
				>
					<StatusBadge tone="neutral" testId="service-meta-env">
						{`env: ${environment}`}
					</StatusBadge>
				</span>
			))}
			{languages.map((language) => (
				<span
					key={language}
					title="telemetry.sdk.language"
					className="tw:inline-flex"
				>
					<StatusBadge tone="neutral" testId="service-meta-language">
						{language}
					</StatusBadge>
				</span>
			))}
			{hosts.length > 0 && (
				<button
					type="button"
					data-testid="service-meta-hosts"
					onClick={onOpenInfrastructure}
					className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-[13px] tw:text-primary! tw:hover:underline"
				>
					{`${hosts.length} ${hosts.length === 1 ? 'host' : 'hosts'}`}
				</button>
			)}
		</span>
	);
}

export default ServiceHeaderMeta;
