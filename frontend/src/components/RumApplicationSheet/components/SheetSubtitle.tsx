import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import dayjs from 'dayjs';
import { PLATFORM_LABELS } from 'lib/rum/platform';

interface SheetSubtitleProps {
	application?: RumtypesApplicationDTO;
}

function SheetSubtitle({ application }: SheetSubtitleProps): JSX.Element {
	if (!application) {
		return <span>Frontend · Real User Monitoring</span>;
	}
	return (
		<span>
			{[
				PLATFORM_LABELS[application.platform],
				application.environment,
				application.createdAt &&
					`created ${dayjs(application.createdAt).format('MMM D, YYYY')}`,
			]
				.filter(Boolean)
				.join(' · ')}
		</span>
	);
}

export default SheetSubtitle;
