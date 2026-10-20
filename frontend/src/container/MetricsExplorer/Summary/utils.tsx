import {
	MetricsexplorertypesStatDTO,
	MetricsexplorertypesTreemapModeDTO,
} from 'api/generated/services/fuseScope.schemas';
import { getUniversalNameFromMetricUnit } from 'components/YAxisUnitSelector/utils';

import MetricTypeViewRenderer from './MetricTypeViewRenderer';
import { MetricsListItemRowData } from './types';

function ValidateRowValueWrapper({
	value,
	children,
}: {
	value: string | number | null;
	children: React.ReactNode;
}): JSX.Element {
	if (!value) {
		return <div>-</div>;
	}
	return <div>{children}</div>;
}

export const formatNumberIntoHumanReadableFormat = (
	num: number,
	addPlusSign = true,
): string => {
	if (!num) {
		return '-';
	}
	function format(num: number, divisor: number, suffix: string): string {
		const value = num / divisor;
		return value % 1 === 0
			? `${value}${suffix}${addPlusSign ? '+' : ''}`
			: `${value.toFixed(1).replace(/\.0$/, '')}${suffix}${
					addPlusSign ? '+' : ''
				}`;
	}

	if (num >= 1_000_000_000) {
		return format(num, 1_000_000_000, 'B');
	}
	if (num >= 1_000_000) {
		return format(num, 1_000_000, 'M');
	}
	if (num >= 1_000) {
		return format(num, 1_000, 'K');
	}
	return num.toString();
};

export const formatDataForMetricsTable = (
	data: MetricsexplorertypesStatDTO[],
): MetricsListItemRowData[] =>
	data.map((metric) => ({
		key: metric.metricName,
		metric_name: (
			<ValidateRowValueWrapper value={metric.metricName}>
				<span title={metric.metricName}>{metric.metricName}</span>
			</ValidateRowValueWrapper>
		),
		description: (
			<ValidateRowValueWrapper value={metric.description}>
				<span className="description-tooltip" title={metric.description}>
					{metric.description}
				</span>
			</ValidateRowValueWrapper>
		),
		metric_type: <MetricTypeViewRenderer type={metric.type} />,
		unit: (
			<ValidateRowValueWrapper value={getUniversalNameFromMetricUnit(metric.unit)}>
				{getUniversalNameFromMetricUnit(metric.unit)}
			</ValidateRowValueWrapper>
		),
		[MetricsexplorertypesTreemapModeDTO.samples]: (
			<ValidateRowValueWrapper
				value={metric[MetricsexplorertypesTreemapModeDTO.samples]}
			>
				<span
					title={metric[MetricsexplorertypesTreemapModeDTO.samples].toLocaleString()}
				>
					{formatNumberIntoHumanReadableFormat(
						metric[MetricsexplorertypesTreemapModeDTO.samples],
					)}
				</span>
			</ValidateRowValueWrapper>
		),
		[MetricsexplorertypesTreemapModeDTO.timeseries]: (
			<ValidateRowValueWrapper
				value={metric[MetricsexplorertypesTreemapModeDTO.timeseries]}
			>
				<span
					title={metric[
						MetricsexplorertypesTreemapModeDTO.timeseries
					].toLocaleString()}
				>
					{formatNumberIntoHumanReadableFormat(
						metric[MetricsexplorertypesTreemapModeDTO.timeseries],
					)}
				</span>
			</ValidateRowValueWrapper>
		),
	}));

export const convertNanoToMilliseconds = (time: number): number =>
	Math.floor(time / 1000000);
