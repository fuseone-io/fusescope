import {
	TableColumnGroupType as ColumnGroupType,
	TableColumnType as ColumnType,
} from 'antd/';
import {
	HistoryData,
	PipelineData,
	ProcessorData,
} from 'types/api/pipeline/def';

import DeploymentStage from '../Layouts/ChangeHistory/DeploymentStage';
import DeploymentTime from '../Layouts/ChangeHistory/DeploymentTime';
import EditedBy from '../Layouts/ChangeHistory/EditedBy';
import DescriptionTextArea from './AddNewPipeline/FormFields/DescriptionTextArea';
import FilterInput from './AddNewPipeline/FormFields/FilterInput';
import NameInput from './AddNewPipeline/FormFields/NameInput';

// Shared by the pipelines table and its processors, so their columns line up.
export const PIPELINE_EXPAND_WIDTH = 48;
export const PIPELINE_ORDER_WIDTH = 48;
export const PIPELINE_NAME_WIDTH = '24%';
export const PIPELINE_FILTER_WIDTH = '20%';
export const PIPELINE_EDITED_WIDTH = 172;
// A processor's name spans its pipeline's name and filters columns.
export const PROCESSOR_NAME_WIDTH = '44%';
export const PIPELINE_ACTIONS_WIDTH = 120;
export const PIPELINE_ENABLED_WIDTH = 88;

export const pipelineFields = [
	{
		id: 1,
		fieldName: 'Name',
		placeholder: 'pipeline_name_placeholder',
		name: 'name',
		component: NameInput,
	},
	{
		id: 2,
		fieldName: 'Description',
		placeholder: 'pipeline_description_placeholder',
		name: 'description',
		component: DescriptionTextArea,
	},
	{
		id: 3,
		fieldName: 'Filter',
		placeholder: 'pipeline_filter_placeholder',
		name: 'filter',
		component: FilterInput,
	},
];

export const pipelineColumns: Array<
	ColumnType<PipelineData> | ColumnGroupType<PipelineData>
> = [
	{
		key: 'orderId',
		title: '',
		dataIndex: 'orderId',
		width: PIPELINE_ORDER_WIDTH,
	},
	{
		key: 'name',
		title: 'Pipeline Name',
		dataIndex: 'name',
		width: PIPELINE_NAME_WIDTH,
	},
	{
		key: 'filter',
		title: 'Filters',
		dataIndex: 'filter',
		width: PIPELINE_FILTER_WIDTH,
	},

	{
		key: 'createdAt',
		title: 'Last Edited',
		dataIndex: 'createdAt',
		width: PIPELINE_EDITED_WIDTH,
	},
	{
		key: 'createdBy',
		title: 'Edited By',
		dataIndex: 'createdBy',
	},
];

export const processorColumns: Array<
	ColumnType<ProcessorData> | ColumnGroupType<ProcessorData>
> = [
	{
		key: 'id',
		title: '',
		dataIndex: 'orderId',
		width: PIPELINE_EXPAND_WIDTH + PIPELINE_ORDER_WIDTH,
		align: 'left',
	},
	{
		key: 'name',
		title: '',
		dataIndex: 'name',
		width: PROCESSOR_NAME_WIDTH,
	},
	{
		key: 'type',
		title: '',
		dataIndex: 'type',
		align: 'right',
	},
];

export const changeHistoryColumns: Array<
	ColumnType<HistoryData> | ColumnGroupType<HistoryData>
> = [
	{
		key: 'version',
		title: 'Version',
		dataIndex: 'version',
	},
	{
		title: 'Deployment Stage',
		key: 'deployStatus',
		dataIndex: 'deployStatus',
		render: DeploymentStage,
	},
	{
		key: 'deployResult',
		title: 'Last Deploy Message',
		dataIndex: 'deployResult',
		ellipsis: true,
	},
	{
		key: 'createdAt',
		title: 'Last Deployed Time',
		dataIndex: 'createdAt',
		render: DeploymentTime,
	},
	{
		key: 'createdByName',
		title: 'Edited by',
		dataIndex: 'createdByName',
		render: EditedBy,
	},
];

export const formValidationRules = [
	{
		required: true,
	},
];

export const holdIconStyle = { fontSize: '1rem', cursor: 'move' };
