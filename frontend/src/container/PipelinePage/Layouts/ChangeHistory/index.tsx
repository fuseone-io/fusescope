import { Table } from 'antd';
import { Pipeline } from 'types/api/pipeline/def';

import { changeHistoryColumns } from '../../PipelineListsView/config';
import { historyPagination } from '../config';

import '../../PipelineListsView/styles.scss';

function ChangeHistory({ pipelineData }: ChangeHistoryProps): JSX.Element {
	return (
		<section
			className="pipelines-list__panel"
			aria-label="Configuration versions"
		>
			<Table
				columns={changeHistoryColumns}
				dataSource={pipelineData?.history ?? []}
				rowKey="id"
				pagination={historyPagination}
			/>
		</section>
	);
}

interface ChangeHistoryProps {
	pipelineData: Pipeline;
}

export default ChangeHistory;
