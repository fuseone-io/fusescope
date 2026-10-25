import type { RumtypesErrorGroupDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { ERROR_KIND_LABELS, errorKind } from 'lib/rum/errorKind';

interface ErrorKindBadgeProps {
	group: Pick<RumtypesErrorGroupDTO, 'source' | 'type'>;
	testId: string;
}

/** Crash or ANR, for Android groups; nothing otherwise. */
function ErrorKindBadge({
	group,
	testId,
}: ErrorKindBadgeProps): JSX.Element | null {
	const kind = errorKind(group);
	if (!kind) {
		return null;
	}
	return (
		<StatusBadge
			tone={kind === 'anr' ? 'warning' : 'error'}
			dot
			testId={testId}
			className="tw:flex-none"
		>
			{ERROR_KIND_LABELS[kind]}
		</StatusBadge>
	);
}

export default ErrorKindBadge;
