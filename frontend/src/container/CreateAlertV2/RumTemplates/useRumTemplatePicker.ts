import { useMemo, useState } from 'react';
import { useListRUMApplications } from 'api/generated/services/rum';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import { rumAlertTemplateFromUrl, rumAlertUrl } from 'lib/rum/alertTemplates';
import { RumAlertTemplateId } from 'lib/rum/alertTemplateTypes';

export type RumTemplatePickerState =
	| { status: 'hidden' }
	| {
			status: 'ready';
			applications: { id: string; name: string }[];
			applicationId: string;
			active?: RumAlertTemplateId;
			pick: (template: RumAlertTemplateId) => void;
			selectApplication: (applicationId: string) => void;
	  };

/** The RUM applications to template a logs alert on, and the template in the URL. */
export function useRumTemplatePicker(enabled: boolean): RumTemplatePickerState {
	const list = useListRUMApplications({
		query: { enabled, retry: false, refetchOnWindowFocus: false },
	});
	const { safeNavigate } = useSafeNavigate();
	const fromUrl = rumAlertTemplateFromUrl(useUrlQuery());
	const [chosen, setChosen] = useState<string>();
	const applications = useMemo(
		() =>
			(list.data?.data ?? []).map(({ id, name }) => ({
				id,
				name: name || id,
			})),
		[list.data],
	);

	if (!enabled || applications.length === 0) {
		return { status: 'hidden' };
	}

	const applicationId =
		[fromUrl?.applicationId, chosen].find((id) =>
			applications.some((application) => application.id === id),
		) ?? applications[0].id;

	const open = (template: RumAlertTemplateId, id: string): void => {
		const application = applications.find((candidate) => candidate.id === id);
		if (!application) {
			return;
		}
		safeNavigate(
			rumAlertUrl(template, {
				applicationId: application.id,
				applicationName: application.name,
				groupBy: template === 'lcp_p75' ? 'route' : undefined,
			}),
		);
	};

	return {
		status: 'ready',
		applications,
		applicationId,
		active:
			fromUrl?.applicationId === applicationId ? fromUrl.template : undefined,
		pick: (template): void => open(template, applicationId),
		selectApplication: (id): void => {
			setChosen(id);
			if (fromUrl) {
				open(fromUrl.template, id);
			}
		},
	};
}
