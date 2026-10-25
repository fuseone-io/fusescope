import { useMemo } from 'react';
import type { RumtypesErrorCauseDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesErrorCauseRelationDTO } from 'api/generated/services/fuseScope.schemas';
import { plural } from 'lib/rum/format';
import { displayFrames, groupFrames } from 'lib/rum/stackFrames';

import FrameList from './FrameList';

interface JvmCauseProps {
	cause: RumtypesErrorCauseDTO;
}

/** One "Caused by" or "Suppressed" exception of a JVM trace. */
function JvmCause({ cause }: JvmCauseProps): JSX.Element {
	const groups = useMemo(
		() => groupFrames(displayFrames(cause.frames, 'original', true)),
		[cause.frames],
	);
	const relation =
		cause.relation === RumtypesErrorCauseRelationDTO.suppressed
			? 'Suppressed'
			: 'Caused by';
	return (
		<div data-testid="rum-error-cause" className="tw:flex tw:flex-col tw:gap-2">
			<p className="tw:m-0 tw:text-xs tw:break-words">
				<span className="tw:text-muted-foreground">{relation}</span>{' '}
				<span className="tw:font-mono tw:font-medium tw:text-error-ink">
					{cause.type}
				</span>
				{cause.message && (
					<span className="tw:font-mono tw:text-muted-foreground">
						: {cause.message}
					</span>
				)}
			</p>
			<FrameList groups={groups} label={`${relation} stack trace`} />
			{cause.omittedFrames > 0 && (
				<span className="tw:pl-2 tw:text-xs tw:text-subtle-foreground">
					… {cause.omittedFrames} more {plural(cause.omittedFrames, 'frame')}, shared
					with the exception above
				</span>
			)}
		</div>
	);
}

export default JvmCause;
