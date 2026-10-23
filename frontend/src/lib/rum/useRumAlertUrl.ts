import { useMemo } from 'react';
import { useGetRUMApplication } from 'api/generated/services/rum';

import { rumAlertUrl } from './alertTemplates';
import { RumAlertTarget, RumAlertTemplateId } from './alertTemplateTypes';

/** The alert editor link for one of the application's templates, once its name is known. */
export function useRumAlertUrl(
	template: RumAlertTemplateId,
	target: Omit<RumAlertTarget, 'applicationName'>,
): string | undefined {
	const application = useGetRUMApplication({ id: target.applicationId });
	const name = application.data?.data?.name;
	const { applicationId, route, groupBy, error } = target;
	const errorType = error?.type;
	const errorMessage = error?.message;

	return useMemo(
		() =>
			name
				? rumAlertUrl(template, {
						applicationId,
						applicationName: name,
						route,
						groupBy,
						error:
							errorType !== undefined
								? { type: errorType, message: errorMessage ?? '' }
								: undefined,
					})
				: undefined,
		[template, applicationId, name, route, groupBy, errorType, errorMessage],
	);
}
