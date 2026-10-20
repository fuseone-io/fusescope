import { UseMutateAsyncFunction } from 'react-query';
import type { NotificationInstance } from 'antd/es/notification/interface';
import {
	ApDexPayloadAndSettingsProps,
	SetApDexPayloadProps,
} from 'types/api/metrics/getApDex';

/** The `tab` param of the service page, in tab order. */
export enum MetricsApplicationTab {
	OVER_METRICS = 'OVER_METRICS',
	ENDPOINTS = 'ENDPOINTS',
	DEPENDENCIES = 'DEPENDENCIES',
	ERRORS = 'ERRORS',
	INFRASTRUCTURE = 'INFRASTRUCTURE',
	DB_CALL_METRICS = 'DB_CALL_METRICS',
	EXTERNAL_METRICS = 'EXTERNAL_METRICS',
}

export const TAB_KEY_VS_LABEL: Record<MetricsApplicationTab, string> = {
	[MetricsApplicationTab.OVER_METRICS]: 'Overview',
	[MetricsApplicationTab.ENDPOINTS]: 'Endpoints',
	[MetricsApplicationTab.DEPENDENCIES]: 'Dependencies',
	[MetricsApplicationTab.ERRORS]: 'Errors',
	[MetricsApplicationTab.INFRASTRUCTURE]: 'Infrastructure',
	[MetricsApplicationTab.DB_CALL_METRICS]: 'DB calls',
	[MetricsApplicationTab.EXTERNAL_METRICS]: 'External',
};

export interface OnSaveApDexSettingsProps {
	thresholdValue: number;
	servicename: string;
	notifications: NotificationInstance;
	refetchGetApDexSetting?: VoidFunction;
	mutateAsync: UseMutateAsyncFunction<
		SetApDexPayloadProps,
		Error,
		ApDexPayloadAndSettingsProps
	>;
	handlePopOverClose: VoidFunction;
}
