import WarningPopover from 'components/WarningPopover/WarningPopover';
import { Querybuildertypesv5QueryWarnDataDTO } from 'api/generated/services/fuseScope.schemas';

import { TriangleAlert } from 'lucide-react';

export type K8sPaginationWarningProps = {
	warning: Querybuildertypesv5QueryWarnDataDTO;
};

export function K8sPaginationWarning({
	warning,
}: K8sPaginationWarningProps): JSX.Element {
	return (
		<span data-testid="k8s-list-warning-popover">
			<WarningPopover
				warningData={{
					code: 'WARNING',
					message: warning.message ?? '',
					url: warning.url ?? '',
					warnings:
						warning.warnings?.map((w) => ({ message: w.message ?? '' })) ?? [],
				}}
			>
				<div className="fs-ui tw:flex tw:h-7 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-md tw:bg-warning-soft tw:px-2.5 tw:font-sans tw:text-xs tw:font-medium tw:text-warning-ink">
					<TriangleAlert size={14} aria-hidden="true" />
					Your data contains some warnings
				</div>
			</WarningPopover>
		</span>
	);
}
