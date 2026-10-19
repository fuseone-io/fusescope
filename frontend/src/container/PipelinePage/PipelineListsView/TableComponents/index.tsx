import React from 'react';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { useTimezone } from 'providers/Timezone';
import { PipelineData, ProcessorData } from 'types/api/pipeline/def';

import UserAvatarCell from 'components/PageTemplate/components/UserAvatarCell';

import { processorTypes } from '../AddNewProcessor/config';
import { ColumnDataStyle, ListDataStyle } from '../styles';
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
	name: ({ record }) => <ListDataStyle>{record}</ListDataStyle>,
	filter: ({ record }) => <PipelineFilterSummary filter={record} />,
};

function TableComponents({
	columnKey,
	record,
}: TableComponentsProps): JSX.Element {
	const Component =
		componentMap[columnKey] ??
		(({ record }): JSX.Element => <ColumnDataStyle>{record}</ColumnDataStyle>);

	return <Component record={record} />;
}

type ComponentMap = {
	[key: string]: React.FC<{ record: Record }>;
};

export type Record = PipelineData['orderId'] &
	PipelineData['filter'] &
	ProcessorData;

interface TableComponentsProps {
	columnKey: string;
	record: Record;
}

export default TableComponents;
