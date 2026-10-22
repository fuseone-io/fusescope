import { Link } from 'react-router-dom';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import TagChip from 'components/PageTemplate/components/TagChip';
import { rumApplicationUrl } from 'lib/rum/links';
import { PLATFORM_LABELS } from 'lib/rum/platform';
import { AppWindow } from 'lucide-react';

interface ApplicationNameCellProps {
	application: RumtypesApplicationDTO;
}

function ApplicationNameCell({
	application,
}: ApplicationNameCellProps): JSX.Element {
	return (
		<div className="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
			<span
				aria-hidden="true"
				title={PLATFORM_LABELS[application.platform]}
				className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
			>
				<AppWindow className="tw:size-4" />
			</span>
			<span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
				<Link
					to={rumApplicationUrl(application.id)}
					data-testid="rum-application-link"
					onClick={(event): void => event.stopPropagation()}
					className="tw:truncate tw:font-mono tw:text-[13px] tw:font-medium tw:text-foreground! tw:hover:text-primary! tw:hover:underline"
				>
					{application.name}
				</Link>
				<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
					{PLATFORM_LABELS[application.platform]}
					<TagChip title="deployment.environment.name">
						{application.environment}
					</TagChip>
				</span>
			</span>
		</div>
	);
}

export default ApplicationNameCell;
