import { useMemo } from 'react';
import type { RumtypesComponentStackDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import CopyButton from 'components/RumApplicationSheet/components/CopyButton';
import { componentFrameGroups, StackMode } from 'lib/rum/stackFrames';

import FrameList from './FrameList';
import MissingSourceMap from './MissingSourceMap';

interface ComponentStackProps {
	applicationId: string;
	stack: NonNullable<RumtypesComponentStackDTO>;
	mode: StackMode;
	/** The stack trace already shows the missing source map notice. */
	missingShown: boolean;
	onOpenSourceMaps: () => void;
}

/** React's component stack of an error an ErrorBoundary caught. */
function ComponentStack({
	applicationId,
	stack,
	mode,
	missingShown,
	onOpenSourceMaps,
}: ComponentStackProps): JSX.Element {
	const groups = useMemo(
		() => componentFrameGroups(stack.frames, mode),
		[stack.frames, mode],
	);
	const missing = stack.missingSourceMap;

	return (
		<section
			aria-labelledby="rum-error-component-stack"
			data-testid="rum-error-component-stack"
			className="tw:mt-2 tw:flex tw:flex-col tw:gap-2.5 tw:border-t tw:border-border tw:pt-4"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-2">
					<h3
						id="rum-error-component-stack"
						className="tw:m-0 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
					>
						Component stack
					</h3>
					{missing && (
						<StatusBadge tone="warning" dot>
							Minified · no source map for {missing.release}
						</StatusBadge>
					)}
				</div>
				<CopyButton value={stack.stack} label="Copy component stack" iconOnly />
			</div>
			{missing && !missingShown && (
				<MissingSourceMap
					applicationId={applicationId}
					missing={missing}
					file={stack.frames?.find((frame) => frame?.file)?.file ?? ''}
					onOpenSourceMaps={onOpenSourceMaps}
				/>
			)}
			<FrameList groups={groups} label="Component stack" />
		</section>
	);
}

export default ComponentStack;
