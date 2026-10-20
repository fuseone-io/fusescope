import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import { Select } from 'antd';
import logEvent from 'api/common/logEvent';
import {
	invalidateGetMetricMetadata,
	invalidateListMetrics,
	useUpdateMetricMetadata,
} from 'api/generated/services/metrics';
import {
	MetrictypesTemporalityDTO,
	MetrictypesTypeDTO,
	RenderErrorResponseDTO,
} from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import YAxisUnitSelector from 'components/YAxisUnitSelector';
import { YAxisSource } from 'components/YAxisUnitSelector/types';
import { getUniversalNameFromMetricUnit } from 'components/YAxisUnitSelector/utils';
import { useNotifications } from 'hooks/useNotifications';
import { Loader2, PenLine } from 'lucide-react';

import { MetricsExplorerEventKeys, MetricsExplorerEvents } from '../events';
import MetricTypeRendererV2 from '../Summary/MetricTypeViewRenderer';
import {
	METRIC_METADATA_KEYS,
	METRIC_METADATA_TEMPORALITY_OPTIONS,
	METRIC_METADATA_TYPE_OPTIONS,
	METRIC_METADATA_UPDATE_ERROR_MESSAGE,
} from './constants';
import MetricDetailsErrorState from './MetricDetailsErrorState';
import MetadataRow from './MetadataRow';
import { MetadataProps, MetricMetadataFormState, TableFields } from './types';
import { transformUpdateMetricMetadataRequest } from './utils';

function Metadata({
	metricName,
	metadata,
	isErrorMetricMetadata,
	isLoadingMetricMetadata,
	refetchMetricMetadata,
}: MetadataProps): JSX.Element {
	const [isEditing, setIsEditing] = useState(false);

	const [metricMetadataState, setMetricMetadataState] =
		useState<MetricMetadataFormState>({
			type: MetrictypesTypeDTO.sum,
			description: '',
			temporality: MetrictypesTemporalityDTO.unspecified,
			unit: '',
			isMonotonic: false,
		});
	const { notifications } = useNotifications();
	const { mutate: updateMetricMetadata, isLoading: isUpdatingMetricsMetadata } =
		useUpdateMetricMetadata();
	const queryClient = useQueryClient();

	// Initialize state from metadata api data
	useEffect(() => {
		if (metadata) {
			setMetricMetadataState({
				type: metadata.type,
				description: metadata.description,
				temporality: metadata.temporality,
				unit: metadata.unit,
				isMonotonic: metadata.isMonotonic,
			});
		}
	}, [metadata]);

	const rows = useMemo(
		() =>
			metadata
				? (Object.keys(METRIC_METADATA_KEYS) as (keyof MetricMetadataFormState)[])
						.filter((key) => key in metadata)
						.map((key) => ({ key, value: metadata[key] }))
				: [],
		[metadata],
	);

	// Render un-editable field value
	const renderUneditableField = useCallback(
		(key: keyof MetricMetadataFormState, value: string) => {
			if (isErrorMetricMetadata) {
				return <span>-</span>;
			}
			if (key === TableFields.TYPE) {
				return <MetricTypeRendererV2 type={value as MetrictypesTypeDTO} />;
			}
			if (key === TableFields.IS_MONOTONIC) {
				return <span>{value ? 'Yes' : 'No'}</span>;
			}
			if (key === TableFields.Temporality) {
				const temporality = METRIC_METADATA_TEMPORALITY_OPTIONS.find(
					(option) => option.value === value,
				);
				return <span>{temporality?.label || '-'}</span>;
			}
			let fieldValue = value;
			if (key === TableFields.UNIT) {
				fieldValue = getUniversalNameFromMetricUnit(value);
			}
			return <span className="tw:break-words">{fieldValue || '-'}</span>;
		},
		[isErrorMetricMetadata],
	);

	const renderColumnValue = useCallback(
		(field: {
			value: string;
			key: keyof MetricMetadataFormState;
		}): JSX.Element => {
			if (!isEditing) {
				return renderUneditableField(field.key, field.value);
			}

			// Don't allow editing of unit if it's already set
			const metricUnitAlreadySet =
				field.key === TableFields.UNIT && Boolean(metadata?.unit);
			if (metricUnitAlreadySet) {
				return (
					<span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
						{renderUneditableField(field.key, field.value)}
						<span className="tw:text-xs tw:text-subtle-foreground">
							Set once; it cannot be changed after the metric has a unit.
						</span>
					</span>
				);
			}

			// Monotonic is not editable
			if (field.key === TableFields.IS_MONOTONIC) {
				return renderUneditableField(field.key, field.value);
			}

			if (field.key === TableFields.TYPE) {
				return (
					<Select
						data-testid="metric-type-select"
						options={METRIC_METADATA_TYPE_OPTIONS}
						value={metricMetadataState.type}
						onChange={(value): void => {
							setMetricMetadataState((prev) => ({
								...prev,
								type: value,
							}));
						}}
					/>
				);
			}
			if (field.key === TableFields.UNIT) {
				return (
					<YAxisUnitSelector
						value={metricMetadataState.unit}
						onChange={(value): void => {
							setMetricMetadataState((prev) => ({ ...prev, unit: value }));
						}}
						data-testid="unit-select"
						source={YAxisSource.EXPLORER}
					/>
				);
			}
			if (field.key === TableFields.Temporality) {
				const temporalityValue =
					metricMetadataState.temporality === MetrictypesTemporalityDTO.unspecified
						? undefined
						: metricMetadataState.temporality;
				return (
					<Select
						data-testid="temporality-select"
						options={METRIC_METADATA_TEMPORALITY_OPTIONS}
						value={temporalityValue}
						onChange={(value): void => {
							setMetricMetadataState((prev) => ({
								...prev,
								temporality: value,
							}));
						}}
					/>
				);
			}
			if (field.key === TableFields.DESCRIPTION) {
				return (
					<Input
						data-testid="description-input"
						aria-label="Description"
						className="tw:h-8 tw:text-[13px]"
						name={field.key}
						defaultValue={metricMetadataState.description}
						onChange={(e): void => {
							setMetricMetadataState((prev) => ({
								...prev,
								[field.key]: e.target.value,
							}));
						}}
					/>
				);
			}
			return <span>-</span>;
		},
		[isEditing, metadata?.unit, metricMetadataState, renderUneditableField],
	);

	const handleSave = useCallback(() => {
		updateMetricMetadata(
			{
				data: transformUpdateMetricMetadataRequest(metricName, metricMetadataState),
			},
			{
				onSuccess: (): void => {
					logEvent(MetricsExplorerEvents.MetricMetadataUpdated, {
						[MetricsExplorerEventKeys.MetricName]: metricName,
						[MetricsExplorerEventKeys.Tab]: 'summary',
						[MetricsExplorerEventKeys.Modal]: 'metric-details',
					});
					notifications.success({
						message: 'Metadata updated successfully',
					});
					setIsEditing(false);
					invalidateListMetrics(queryClient);
					invalidateGetMetricMetadata(queryClient, {
						metricName,
					});
				},
				onError: (error): void => {
					const errorMessage = (error as AxiosError<RenderErrorResponseDTO>).response
						?.data.error?.message;
					notifications.error({
						message: errorMessage || METRIC_METADATA_UPDATE_ERROR_MESSAGE,
					});
				},
			},
		);
	}, [
		updateMetricMetadata,
		metricName,
		metricMetadataState,
		notifications,
		queryClient,
	]);

	const cancelEdit = useCallback(
		(e: React.MouseEvent<HTMLElement, MouseEvent>): void => {
			e.stopPropagation();
			if (metadata) {
				setMetricMetadataState({
					type: metadata.type,
					description: metadata.description,
					unit: metadata.unit,
					temporality: metadata.temporality,
					isMonotonic: metadata.isMonotonic,
				});
			}
			setIsEditing(false);
		},
		[metadata],
	);

	const actionButton = useMemo(() => {
		if (isEditing) {
			return (
				<div className="tw:flex tw:gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						onClick={cancelEdit}
						disabled={isUpdatingMetricsMetadata}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={(e): void => {
							e.stopPropagation();
							handleSave();
						}}
						disabled={isUpdatingMetricsMetadata}
					>
						Save
					</Button>
				</div>
			);
		}
		if (isErrorMetricMetadata) {
			return null;
		}
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={(e): void => {
					e.stopPropagation();
					setIsEditing(true);
				}}
				disabled={isUpdatingMetricsMetadata || isLoadingMetricMetadata}
			>
				<PenLine />
				Edit
			</Button>
		);
	}, [
		isEditing,
		isErrorMetricMetadata,
		isUpdatingMetricsMetadata,
		isLoadingMetricMetadata,
		cancelEdit,
		handleSave,
	]);

	let body: JSX.Element;
	if (isLoadingMetricMetadata) {
		body = (
			<div className="tw:flex tw:justify-center tw:py-6">
				<Loader2
					aria-label="Loading metadata"
					className="tw:size-4 tw:animate-spin tw:text-muted-foreground"
				/>
			</div>
		);
	} else if (isErrorMetricMetadata) {
		body = (
			<MetricDetailsErrorState
				refetch={refetchMetricMetadata}
				errorMessage="Something went wrong while fetching metric metadata"
			/>
		);
	} else {
		body = (
			<div>
				{rows.map((row) => (
					<MetadataRow key={row.key} label={METRIC_METADATA_KEYS[row.key]}>
						{renderColumnValue({ key: row.key, value: row.value as string })}
					</MetadataRow>
				))}
			</div>
		);
	}

	return (
		<section
			aria-labelledby="metric-metadata-title"
			className="metrics-metadata-accordion fs-ui tw:flex tw:flex-col tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:min-h-[52px] tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:px-4 tw:py-2.5">
				<h3 id="metric-metadata-title" className="tw:text-sm tw:font-semibold">
					Metadata
				</h3>
				{actionButton}
			</div>
			{body}
		</section>
	);
}

export default Metadata;
