export interface IntegrationsProps {
	author: {
		email: string;
		homepage: string;
		name: string;
	};
	description: string;
	id: string;
	icon: string;
	is_installed: boolean;
	is_new?: boolean;
	title: string;
	version?: string;
	latest_version?: string;
}

export interface AllIntegrationsProps {
	status: string;
	data: {
		integrations: IntegrationsProps[];
	};
}

export interface CollectedLogAttribute {
	name: string;
	path: string;
	type: string;
}

export interface CollectedMetric {
	name: string;
	type: string;
	unit: string;
	description?: string;
}

export interface IntegrationDetailedProps {
	description: string;
	id: string;
	installation: {
		installed_at: string;
		version: string;
	} | null;
	title: string;
	version: string;
	latest_version: string;
	author: {
		email: string;
		homepage: string;
		name: string;
	};
	icon: string;
	connection_status: {
		logs: {
			last_received_ts_ms: number;
			last_received_from: string;
		} | null;
		metrics: {
			last_received_ts_ms: number;
			last_received_from: string;
		} | null;
	};
	categories: string[];
	assets: {
		logs: {
			pipelines: [];
		};
		dashboards: [];
		alerts: [];
	};
	overview: string;
	configuration: [
		{
			title: string;
			instructions: string;
		},
	];
	data_collected: {
		logs: CollectedLogAttribute[];
		metrics: CollectedMetric[];
	};
}
export interface GetIntegrationProps {
	data: IntegrationDetailedProps;
}

export interface IntegrationConnectionStatus {
	logs: {
		last_received_ts_ms: number;
		last_received_from: string;
	} | null;
	metrics: {
		last_received_ts_ms: number;
		last_received_from: string;
	} | null;
}

export interface GetIntegrationStatusProps {
	data: IntegrationConnectionStatus;
}

export interface GetIntegrationPayloadProps {
	integrationId: string;
	enabled?: boolean;
}

export interface InstallIntegrationKeyProps {
	integration_id: string;
	config: any;
}

export interface InstalledIntegrationsSuccessResponse {
	data: IntegrationsProps;
}

export interface UninstallIntegrationProps {
	integration_id: string;
}

export interface UpgradeIntegrationProps {
	integration_id: string;
}

export interface UninstallIntegrationSuccessResponse {
	data: any;
}
