import { NativeSelect, NativeSelectOption } from 'components/ui/native-select';
import { useCreateAlertState } from 'container/CreateAlertV2/context';
import { RUM_ALERT_TEMPLATES } from 'lib/rum/alertTemplates';
import { AlertTypes } from 'types/api/alerts/alertTypes';

import RumTemplateCard from './RumTemplateCard';
import { useRumTemplatePicker } from './useRumTemplatePicker';

/** Frontend (RUM) templates for a new logs alert. */
function RumTemplatePicker(): JSX.Element | null {
	const { alertType, isEditMode } = useCreateAlertState();
	const state = useRumTemplatePicker(
		!isEditMode && alertType === AlertTypes.LOGS_BASED_ALERT,
	);

	if (state.status === 'hidden') {
		return null;
	}

	return (
		<section
			aria-labelledby="rum-template-title"
			data-testid="rum-template-picker"
			className="fs-ui tw:mb-4 tw:flex tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-5 tw:py-4 tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
				<p className="tw:m-0 tw:text-[13px]">
					<span id="rum-template-title" className="tw:font-medium">
						Start from a frontend template
					</span>
					<span className="tw:text-muted-foreground">
						{' '}
						· fills the query, condition and name below
					</span>
				</p>
				<label className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-muted-foreground">
					Application
					<NativeSelect
						value={state.applicationId}
						onChange={(event): void => state.selectApplication(event.target.value)}
						data-testid="rum-template-application"
						className="tw:h-8 tw:font-mono tw:text-xs"
					>
						{state.applications.map((application) => (
							<NativeSelectOption key={application.id} value={application.id}>
								{application.name}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</label>
			</div>
			<div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-3">
				{RUM_ALERT_TEMPLATES.map((template) => (
					<RumTemplateCard
						key={template}
						template={template}
						pressed={state.active === template}
						onPick={state.pick}
					/>
				))}
			</div>
		</section>
	);
}

export default RumTemplatePicker;
