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

import ComponentStack from './ComponentStack';
import FrameList from './FrameList';
import JvmCause from './JvmCause';
import MinifiedStack from './MinifiedStack';
import MissingSourceMap from './MissingSourceMap';

interface StackTraceProps {
	applicationId: string;
	/** Remount per event: the view starts at the event's default. */
	event: RumtypesErrorEventDTO;
	/** A JVM trace of an Android application, retraced with R8 mappings. */
	jvm: boolean;
	onOpenSourceMaps: () => void;
}

const WORDS = {
	web: {
		resolved: 'Symbolicated',
		raw: 'Minified',
		noMatch: 'no uploaded map matches these files',
		missing: 'no source map for',
		upload: 'Upload this release’s source maps to see the original code',
	},
	jvm: {
		resolved: 'Retraced',
		raw: 'Obfuscated',
		noMatch: 'the mapping resolves none of these frames',
		missing: 'no R8 mapping for',
		upload: 'Upload this release’s R8 mapping to see the original code',
	},
};

function StackTrace({
	applicationId,
	event,
	jvm,
	onOpenSourceMaps,
}: StackTraceProps): JSX.Element {
	const words = jvm ? WORDS.jvm : WORDS.web;
	const [mode, setMode] = useState<StackMode>(() => defaultStackMode(event));
	const canShowOriginal = defaultStackMode(event) === 'original';
	const groups = useMemo(
		() => groupFrames(displayFrames(event.frames, 'original', jvm)),
		[event.frames, jvm],
	);
	const causes = jvm ? (event.causes ?? []) : [];
	const firstApp = groups.find((group) => group.kind === 'app')?.key;
	const sourceMap = event.frames?.find((frame) => frame?.original)?.original
		?.sourceMap;
	const missing = event.missingSourceMap;

	let badge = (
		<StatusBadge tone="neutral" dot>
			{words.raw} · {words.noMatch}
		</StatusBadge>
	);
	if (canShowOriginal) {
		badge = (
			<StatusBadge tone="success" dot testId="rum-error-symbolicated">
				{words.resolved} · <span className="tw:font-mono">{sourceMap}</span>
			</StatusBadge>
		);
	} else if (missing) {
		badge = (
			<StatusBadge tone="warning" dot>
				{words.raw} · {words.missing} {missing.release}
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
								title: canShowOriginal ? undefined : words.upload,
							},
							{
								value: 'minified',
								label: words.raw,
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
					missing={missing}
					file={jvm ? '' : (event.frames?.find((frame) => frame?.file)?.file ?? '')}
					onOpenSourceMaps={onOpenSourceMaps}
				/>
			)}
			{mode === 'original' ? (
				<>
					<FrameList
						groups={groups}
						label="Original stack trace"
						openKey={firstApp}
					/>
					{causes.map((cause) => (
						<JvmCause
							key={`${cause.relation}:${cause.type}:${cause.message}`}
							cause={cause}
						/>
					))}
				</>
			) : (
				<MinifiedStack event={event} jvm={jvm} />
			)}
			{event.componentStack && (
				<ComponentStack
					applicationId={applicationId}
					stack={event.componentStack}
					mode={canShowOriginal ? mode : 'original'}
					missingShown={Boolean(missing)}
					onOpenSourceMaps={onOpenSourceMaps}
				/>
			)}
		</section>
	);
}

export default StackTrace;
