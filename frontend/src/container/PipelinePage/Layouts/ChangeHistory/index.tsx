import { useState } from 'react';
import { Table } from 'antd';
import cx from 'classnames';
import { HistoryData, Pipeline } from 'types/api/pipeline/def';

import { changeHistoryColumns } from '../../PipelineListsView/config';
import { historyPagination } from '../config';
import VersionDetails from './VersionDetails';

import '../../PipelineListsView/styles.scss';

function ChangeHistory({ pipelineData }: ChangeHistoryProps): JSX.Element {
	const history = pipelineData?.history ?? [];
	const [selectedId, setSelectedId] = useState<string>();
	const selected =
		history.find((version) => version.id === selectedId) ?? history[0];

	return (
		<div className="pipelines-history">
			<section
				className="pipelines-list__panel"
				aria-label="Configuration versions"
			>
				<Table
					columns={changeHistoryColumns}
					dataSource={history}
					rowKey="id"
					pagination={historyPagination}
					rowClassName={(record: HistoryData): string =>
						cx('pipelines-history__row', {
							'pipelines-history__row--selected': record.id === selected?.id,
						})
					}
					onRow={(record: HistoryData): React.HTMLAttributes<HTMLElement> => ({
						onClick: (): void => setSelectedId(record.id),
					})}
				/>
			</section>
			{selected && <VersionDetails version={selected} />}
		</div>
	);
}

interface ChangeHistoryProps {
	pipelineData: Pipeline;
}

export default ChangeHistory;
