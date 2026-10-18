import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import {
	useListAccounts,
	useListAccountServicesMetadata,
	useListServicesMetadata,
} from 'api/generated/services/cloudintegration';
import type { CloudintegrationtypesServiceMetadataDTO } from 'api/generated/services/fuseScope.schemas';
import { Skeleton } from 'components/ui/skeleton';
import { IntegrationType } from 'container/Integrations/types';
import useUrlQuery from 'hooks/useUrlQuery';
import { cn } from 'lib/utils';

import ServicesListGroup from './ServicesListGroup';

interface ServicesListProps {
	cloudAccountId: string;
	type: IntegrationType;
}

function ServicesList({
	cloudAccountId,
	type,
}: ServicesListProps): JSX.Element {
	const urlQuery = useUrlQuery();
	const navigate = useNavigate();
	const isAccountConnected = Boolean(cloudAccountId);
	const { data: listAccountsResponse, isLoading: isAccountsLoading } =
		useListAccounts({ cloudProvider: type });
	const hasConnectedAccounts =
		(listAccountsResponse?.data?.accounts?.length ?? 0) > 0;

	const { data: accountServicesMetadata, isLoading: isAccountServicesLoading } =
		useListAccountServicesMetadata(
			{ cloudProvider: type, id: cloudAccountId },
			{ query: { enabled: isAccountConnected } },
		);

	const {
		data: providerServicesMetadata,
		isLoading: isProviderServicesLoading,
	} = useListServicesMetadata(
		{ cloudProvider: type },
		{
			query: { enabled: !isAccountsLoading && !hasConnectedAccounts },
		},
	);

	const servicesMetadata = hasConnectedAccounts
		? accountServicesMetadata
		: providerServicesMetadata;
	const isLoading =
		isAccountsLoading ||
		(hasConnectedAccounts
			? isAccountServicesLoading || !isAccountConnected
			: isProviderServicesLoading);

	const awsServices = useMemo(
		() => servicesMetadata?.data?.services ?? [],
		[servicesMetadata],
	);

	const activeService = urlQuery.get('service');

	const handleActiveService = useCallback(
		(serviceId: string): void => {
			const latestUrlQuery = new URLSearchParams(window.location.search);
			latestUrlQuery.set('service', serviceId);
			navigate({ search: latestUrlQuery.toString() });
		},
		[navigate],
	);

	const enabledServices = useMemo(
		() => awsServices.filter((service) => service.enabled),
		[awsServices],
	);

	// Derive from enabled to guarantee each service is in exactly one list
	const enabledIds = useMemo(
		() => new Set(enabledServices.map((s) => s.id)),
		[enabledServices],
	);
	const notEnabledServices = useMemo(
		() => awsServices?.filter((s) => !enabledIds.has(s.id)) ?? [],
		[awsServices, enabledIds],
	);

	useEffect(() => {
		const allServices = [...enabledServices, ...notEnabledServices];
		const defaultServiceId =
			enabledServices[0]?.id ?? notEnabledServices[0]?.id ?? null;

		// If a service is already selected and still exists in the refreshed list, keep it
		if (activeService && allServices.some((s) => s.id === activeService)) {
			return;
		}

		// No valid selection — pick a default
		if (defaultServiceId) {
			handleActiveService(defaultServiceId);
		}
	}, [activeService, enabledServices, notEnabledServices, handleActiveService]);

	if (isLoading) {
		return (
			<div
				data-testid="services-list-loading"
				className="tw:flex tw:flex-col tw:gap-2 tw:p-3"
			>
				{['a', 'b', 'c', 'd'].map((key) => (
					<Skeleton key={key} className="tw:h-8 tw:w-full tw:bg-muted" />
				))}
			</div>
		);
	}

	if (!awsServices?.length) {
		return (
			<p className="fs-ui tw:p-4 tw:font-sans tw:text-sm tw:text-muted-foreground">
				No services found
			</p>
		);
	}

	const renderServiceItem = (
		service: CloudintegrationtypesServiceMetadataDTO,
	): JSX.Element => {
		const isActive = service.id === activeService;
		return (
			<button
				type="button"
				key={service.id}
				aria-current={isActive ? 'true' : undefined}
				className={cn(
					'aws-services-list-view-sidebar-content-item tw:flex tw:h-8 tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-md tw:px-2 tw:text-left tw:text-[13px] tw:text-muted-foreground tw:transition-colors tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none',
					isActive && 'active tw:bg-primary-soft tw:font-medium tw:text-primary-ink',
				)}
				onClick={(): void => handleActiveService(service.id)}
			>
				<img
					src={service.icon}
					alt={service.title}
					className="tw:size-5 tw:flex-none tw:object-contain"
				/>
				<span className="tw:truncate" title={service.title}>
					{service.title}
				</span>
			</button>
		);
	};

	return (
		<nav
			aria-label="Services"
			className="aws-services-list-view fs-ui tw:flex tw:flex-col tw:gap-4 tw:p-3 tw:font-sans tw:text-foreground"
		>
			<ServicesListGroup label="Enabled">
				{enabledServices.map((service) => renderServiceItem(service))}
				{enabledServices.length === 0 && (
					<p className="tw:px-2 tw:text-xs tw:text-subtle-foreground">
						No enabled services
					</p>
				)}
			</ServicesListGroup>

			{notEnabledServices.length > 0 && (
				<ServicesListGroup label="Not Enabled">
					{notEnabledServices.map((service) => renderServiceItem(service))}
				</ServicesListGroup>
			)}
		</nav>
	);
}

export default ServicesList;
