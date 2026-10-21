import React from 'react';
import TagChip from 'components/PageTemplate/components/TagChip';
import {
	InframonitoringtypesHostRecordDTO,
	InframonitoringtypesHostStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	EntityStatus,
	K8sDetailsMetadataConfig,
} from 'container/InfraMonitoringK8sV2/Base/types';
import { INFRA_MONITORING_ATTR_KEYS } from 'container/InfraMonitoringK8sV2/constants';
import { formatValueForExpression } from 'components/QueryBuilderV2/utils';
import { TextNoData } from 'container/InfraMonitoringK8sV2/components';
import { getStrokeColorForPercent } from 'container/InfraMonitoringK8sV2/components/EntityProgressBar.utils';
import UsageBar from 'container/InfraMonitoringK8sV2/components/UsageBar';
import { SelectedItemParams } from 'container/InfraMonitoringK8sV2/hooks';
import {
	getHostQueryPayload,
	hostWidgetInfo,
} from 'container/LogDetailedView/InfraMetrics/constants';

export type HostDetailMetadataConfigType =
	K8sDetailsMetadataConfig<InframonitoringtypesHostRecordDTO>;
export const hostGetStatus = (
	h: InframonitoringtypesHostRecordDTO,
): EntityStatus =>
	h.status === InframonitoringtypesHostStatusDTO.active
		? { label: 'Active', tone: 'success' }
		: { label: 'Inactive', tone: 'warning' };

export const hostDetailsMetadataConfig: HostDetailMetadataConfigType[] = [
	{
		label: 'OPERATING SYSTEM',
		getValue: (h): string => h.meta?.[INFRA_MONITORING_ATTR_KEYS.OS_TYPE] || '-',
		render: (value): React.ReactNode =>
			value !== '-' ? (
				<TagChip className="tw:self-start">{value}</TagChip>
			) : (
				<TextNoData type="typography" />
			),
	},
	{
		label: 'CPU USAGE',
		getValue: (h): number => h.cpu * 100,
		render: (value): React.ReactNode => (
			<UsageBar
				percent={Number(Number(value).toFixed(1))}
				color={getStrokeColorForPercent('cpu', Number(value))}
			/>
		),
	},
	{
		label: 'MEMORY USAGE',
		getValue: (h): number => h.memory * 100,
		render: (value): React.ReactNode => (
			<UsageBar
				percent={Number(Number(value).toFixed(1))}
				color={getStrokeColorForPercent('memory', Number(value))}
			/>
		),
	},
];

export function getHostMetricsQueryPayload(
	host: InframonitoringtypesHostRecordDTO,
	start: number,
	end: number,
): ReturnType<typeof getHostQueryPayload> {
	return getHostQueryPayload(host.hostName, start, end);
}

export { hostWidgetInfo };

export const hostGetSelectedItemExpression = (
	params: SelectedItemParams,
): string =>
	`${INFRA_MONITORING_ATTR_KEYS.HOST_NAME} = ${formatValueForExpression(params.selectedItem ?? '')}`;

export function hostInitialLogTracesExpression(
	host: InframonitoringtypesHostRecordDTO,
): string {
	const hostName = formatValueForExpression(host.hostName || '');
	return `${INFRA_MONITORING_ATTR_KEYS.HOST_NAME} = ${hostName}`;
}

export function hostInitialEventsExpression(
	_host: InframonitoringtypesHostRecordDTO,
): string {
	return '';
}

export const hostGetEntityName = (
	host: InframonitoringtypesHostRecordDTO,
): string => host.hostName;
