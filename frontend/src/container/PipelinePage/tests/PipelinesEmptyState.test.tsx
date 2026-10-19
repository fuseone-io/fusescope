import { I18nextProvider } from 'react-i18next';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { logEventMock } from '__tests__/logEventMock';
import { fuseScopeDocsUrl } from 'constants/docs';
import { PreferenceContextProvider } from 'providers/preferences/context/PreferenceContextProvider';
import i18n from 'ReactI18';
import { render as renderWithProviders } from 'tests/test-utils';
import { ActionMode, ActionType } from 'types/api/pipeline/def';

import { pipelineApiResponseMockData } from '../mocks/pipeline';
import PipelineListsView from '../PipelineListsView';
import PipelinesEmptyState from '../PipelineListsView/PipelinesEmptyState';

describe('PipelinesEmptyState', () => {
	it('explains pipelines without an embedded video', () => {
		const { container } = render(
			<I18nextProvider i18n={i18n}>
				<PipelinesEmptyState onAddNewPipeline={jest.fn()} />
			</I18nextProvider>,
		);

		expect(screen.getByText('No pipelines yet')).toBeInTheDocument();
		expect(screen.getByText('Severity Parser')).toBeInTheDocument();
		expect(container.querySelector('iframe')).toBeNull();
		expect(screen.getByRole('link', { name: /Read the docs/ })).toHaveAttribute(
			'href',
			fuseScopeDocsUrl('/sending-data/log-pipelines/'),
		);
	});

	it('starts a new pipeline', async () => {
		const onAddNewPipeline = jest.fn();
		render(
			<I18nextProvider i18n={i18n}>
				<PipelinesEmptyState onAddNewPipeline={onAddNewPipeline} />
			</I18nextProvider>,
		);

		await userEvent.click(screen.getByRole('button', { name: /new_pipeline/ }));

		expect(onAddNewPipeline).toHaveBeenCalledTimes(1);
	});
});

describe('PipelineListsView empty state wiring', () => {
	it('enters edit mode on a new pipeline and tracks it', async () => {
		const setActionMode = jest.fn();
		const setActionType = jest.fn();

		renderWithProviders(
			<PreferenceContextProvider>
				<PipelineListsView
					isActionType=""
					setActionType={setActionType}
					isActionMode={ActionMode.Viewing}
					setActionMode={setActionMode}
					pipelineData={{ ...pipelineApiResponseMockData, pipelines: [] }}
					refetchPipelineLists={jest.fn()}
				/>
			</PreferenceContextProvider>,
		);

		await userEvent.click(screen.getByRole('button', { name: /new_pipeline/ }));

		expect(setActionMode).toHaveBeenCalledWith(ActionMode.Editing);
		expect(setActionType).toHaveBeenCalledWith(ActionType.AddPipeline);
		expect(logEventMock).toHaveBeenCalledWith(
			'Logs: Pipelines: Clicked Add New Pipeline',
			{ source: 'signoz-ui' },
		);
	});
});
