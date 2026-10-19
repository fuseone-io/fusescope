import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import * as Sentry from '@sentry/react';
import getPipeline from 'api/pipeline/get';
import Spinner from 'components/Spinner';
import ChangeHistory from 'container/PipelinePage/Layouts/ChangeHistory';
import PipelinePage from 'container/PipelinePage/Layouts/Pipeline';
import { useNotifications } from 'hooks/useNotifications';
import ErrorBoundaryFallback from 'pages/ErrorBoundaryFallback/ErrorBoundaryFallback';
import cx from 'classnames';
import { History, Workflow } from 'lucide-react';
import { Pipeline } from 'types/api/pipeline/def';

import { pipelineRefetchInterval } from './utils';

import './Pipelines.styles.scss';

function Pipelines(): JSX.Element {
	const { t } = useTranslation('common');
	const { notifications } = useNotifications();
	const {
		isLoading,
		data: pipelineData,
		isError,
		refetch: refetchPipelineLists,
	} = useQuery(['version', 'latest', 'pipeline'], {
		queryFn: () =>
			getPipeline({
				version: 'latest',
			}),
		refetchInterval: pipelineRefetchInterval,
	});

	const [activeSection, setActiveSection] =
		useState<PipelinesSection>('pipelines');
	const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
		null,
	);
	const historyCount = pipelineData?.payload?.history?.length ?? 0;

	useEffect(() => {
		if (pipelineData?.error && isError) {
			notifications.error({
				message: pipelineData?.error || t('something_went_wrong'),
			});
		}
	}, [isError, notifications, pipelineData?.error, t]);

	if (isLoading) {
		return <Spinner height="75vh" tip="Loading Pipelines..." />;
	}

	return (
		<Sentry.ErrorBoundary fallback={<ErrorBoundaryFallback />}>
			<div className="pipelines-page">
				<div className="pipelines-page__bar fs-ui">
					<div
						role="tablist"
						aria-label="Pipelines sections"
						className="pipelines-page__sections"
					>
						{SECTIONS.map(({ key, label, Icon }) => (
							<button
								key={key}
								type="button"
								role="tab"
								id={`pipelines-tab-${key}`}
								aria-controls={`pipelines-panel-${key}`}
								aria-selected={activeSection === key}
								className={cx('pipelines-page__section', {
									'pipelines-page__section--active': activeSection === key,
								})}
								onClick={(): void => setActiveSection(key)}
							>
								<Icon aria-hidden="true" />
								{label}
							</button>
						))}
					</div>
					<div
						ref={setActionsTarget}
						className="pipelines-page__actions"
						hidden={activeSection !== 'pipelines'}
					/>
					{activeSection === 'change-history' && (
						<span className="pipelines-page__meta">
							<span className="pipelines-page__meta-count">{historyCount}</span>{' '}
							<span>
								{historyCount === 1
									? 'configuration version'
									: 'configuration versions'}
							</span>
						</span>
					)}
				</div>
				{/* Both sections stay mounted so unsaved edits survive a look at the history. */}
				<div
					role="tabpanel"
					id="pipelines-panel-pipelines"
					aria-labelledby="pipelines-tab-pipelines"
					hidden={activeSection !== 'pipelines'}
				>
					<PipelinePage
						refetchPipelineLists={refetchPipelineLists}
						pipelineData={pipelineData?.payload as Pipeline}
						actionsTarget={actionsTarget}
					/>
				</div>
				<div
					role="tabpanel"
					id="pipelines-panel-change-history"
					aria-labelledby="pipelines-tab-change-history"
					hidden={activeSection !== 'change-history'}
				>
					<ChangeHistory pipelineData={pipelineData?.payload as Pipeline} />
				</div>
			</div>
		</Sentry.ErrorBoundary>
	);
}

type PipelinesSection = 'pipelines' | 'change-history';

const SECTIONS: {
	key: PipelinesSection;
	label: string;
	Icon: typeof Workflow;
}[] = [
	{ key: 'pipelines', label: 'Pipelines', Icon: Workflow },
	{ key: 'change-history', label: 'Change history', Icon: History },
];

export default Pipelines;
