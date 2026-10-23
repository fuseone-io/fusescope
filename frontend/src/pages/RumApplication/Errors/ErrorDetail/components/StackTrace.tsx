import { useMemo, useState } from 'react';
import type { RumtypesErrorEventDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import CopyButton from 'components/RumApplicationSheet/components/CopyButton';
import {
	defaultStackMode,
	displayFrames,
	groupFrames,
	StackMode,
} from 'lib/rum/stackFrames';

import AppFrame from './AppFrame';
import LibraryFrames from './LibraryFrames';
import MinifiedStack from './MinifiedStack';
import MissingSourceMap from './MissingSourceMap';

interface StackTraceProps {
	applicationId: string;
	/** Remount per event: the view starts at the event's default. */
	event: RumtypesErrorEventDTO;
	onOpenSourceMaps: () => void;
}

function StackTrace({
	applicationId,
	event,
	onOpenSourceMaps,
}: StackTraceProps): JSX.Element {
	const [mode, setMode] = useState<StackMode>(() => defaultStackMode(event));
	const canShowOriginal = defaultStackMode(event) === 'original';
	const groups = useMemo(
		() => groupFrames(displayFrames(event.frames, 'original')),
		[event.frames],
	);
	const firstApp = groups.find((group) => group.kind === 'app')?.key;
	const sourceMap = event.frames?.find((frame) => frame?.original)?.original
		?.sourceMap;
	const missing = event.missingSourceMap;

	let badge = (
		<StatusBadge tone="neutral" dot>
			Minified · no uploaded map matches these files
		</StatusBadge>
	);
	if (canShowOriginal) {
		badge = (
			<StatusBadge tone="success" dot testId="rum-error-symbolicated">
				Symbolicated · <span className="tw:font-mono">{sourceMap}</span>
			</StatusBadge>
		);
	} else if (missing) {
		badge = (
			<StatusBadge tone="warning" dot>
				Minified · no source map for {missing.release}
			</StatusBadge>
		);
	}

	return (
		<section
			aria-labelledby="rum-error-stack"
			data-testid="rum-error-stack"
			className="tw:flex tw:min-w-0 tw:flex-[2_1_520px] tw:flex-col tw:gap-2.5 tw:border-border tw:px-5 tw:pt-4 tw:pb-5 tw:lg:border-r"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-2">
					<h3
						id="rum-error-stack"
						className="tw:m-0 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
					>
						Stack trace
					</h3>
					{badge}
				</div>
				<div className="tw:flex tw:items-center tw:gap-1.5">
					<SegmentedControl<StackMode>
						label="Stack trace view"
						size="sm"
						options={[
							{
								value: 'original',
								label: 'Original',
								testId: 'rum-error-mode-original',
								disabled: !canShowOriginal,
								title: canShowOriginal
									? undefined
									: 'Upload this release’s source maps to see the original code',
							},
							{
								value: 'minified',
								label: 'Minified',
								testId: 'rum-error-mode-minified',
							},
						]}
						value={mode}
						onChange={setMode}
					/>
					<CopyButton value={event.stacktrace} label="Copy stack trace" iconOnly />
				</div>
			</div>
			{missing && (
				<MissingSourceMap
					applicationId={applicationId}
					release={missing.release}
					file={event.frames?.find((frame) => frame?.file)?.file ?? ''}
					onOpenSourceMaps={onOpenSourceMaps}
				/>
			)}
			{mode === 'original' ? (
				<ol
					aria-label="Original stack trace"
					className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0"
				>
					{groups.map((group) =>
						group.kind === 'app' ? (
							<AppFrame
								key={group.key}
								frame={group.frame}
								initiallyOpen={group.key === firstApp}
							/>
						) : (
							<LibraryFrames
								key={group.key}
								frames={group.frames}
								label={group.label}
							/>
						),
					)}
				</ol>
			) : (
				<MinifiedStack event={event} />
			)}
		</section>
	);
}

export default StackTrace;
