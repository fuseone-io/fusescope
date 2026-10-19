import React from 'react';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { useTimezone } from 'providers/Timezone';
import { PipelineData, ProcessorData } from 'types/api/pipeline/def';

import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';
import { Workflow } from 'lucide-react';

import { processorTypes } from '../AddNewProcessor/config';
import { ColumnDataStyle } from '../styles';
import { PROCESSOR_TYPE_ICONS } from './processorTypeIcons';
import PipelineFilterSummary from './PipelineFilterSummary';

function CreatedAtComponent({ record }: { record: Record }): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	return (
		<ColumnDataStyle>
			{formatTimezoneAdjustedTimestamp(record, DATE_TIME_FORMATS.UTC_MONTH_FULL)}
		</ColumnDataStyle>
	);
}

function OrderIndex({
	record,
	small = false,
}: {
	record: Record;
	small?: boolean;
}): JSX.Element {
	return (
		<span
			className={
				small
					? 'pipeline-order-index pipeline-order-index--small'
					: 'pipeline-order-index'
			}
		>
			{record}
		</span>
	);
}

OrderIndex.defaultProps = { small: false };

const componentMap: ComponentMap = {
	orderId: ({ record }) => <OrderIndex record={record} />,
	createdAt: ({ record }) => <CreatedAtComponent record={record} />,
	createdBy: ({ record }) => (
		<span className="fs-ui tw:flex tw:min-w-0">
			<UserAvatarCell email={String(record ?? '')} />
		</span>
	),
	id: ({ record }) => <OrderIndex record={record} small />,
	type: ({ record }) => (
		<span className="pipeline-processor-type">
			{processorTypes.find((type) => type.value === String(record))?.label ??
				String(record ?? '')}
		</span>
	),
	name: ({ record, row }) => {
		const processorType = (row as ProcessorData | undefined)?.type;
		if (processorType) {
			const Icon = PROCESSOR_TYPE_ICONS[processorType] ?? Workflow;
			return (
				<span className="pipeline-processor-name">
					<span className="pipeline-processor-type__icon" aria-hidden="true">
						<Icon />
					</span>
					<span className="pipeline-name-cell__name">{record}</span>
				</span>
			);
		}
		const description = (row as PipelineData | undefined)?.description;
		return (
			<span className="pipeline-name-cell">
				<span className="pipeline-name-cell__name">{record}</span>
				{description && (
					<span className="pipeline-name-cell__description" title={description}>
						{description}
					</span>
				)}
			</span>
		);
	},
	filter: ({ record }) => <PipelineFilterSummary filter={record} />,
};

function TableComponents({
	columnKey,
	record,
	row,
}: TableComponentsProps): JSX.Element {
	const Component =
		componentMap[columnKey] ??
		(({ record }): JSX.Element => <ColumnDataStyle>{record}</ColumnDataStyle>);

	return <Component record={record} row={row} />;
}

type ComponentMap = {
	[key: string]: React.FC<{ record: Record; row?: unknown }>;
};

export type Record = PipelineData['orderId'] &
	PipelineData['filter'] &
	ProcessorData;

interface TableComponentsProps {
	columnKey: string;
	record: Record;
	/** The whole row, for cells that show more than their own field. */
	row?: unknown;
}

export default TableComponents;
