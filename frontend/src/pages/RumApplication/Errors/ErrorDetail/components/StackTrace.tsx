import { useMemo, useState } from 'react';
import type { RumtypesErrorEventDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import CopyButton from 'components/RumApplicationSheet/components/CopyButton';
import {
	defaultStackMode,
	displayFrames,
	groupFrames,
	resolvingSourceMap,
	StackMode,
} from 'lib/rum/stackFrames';

import { STACK_WORDS } from '../constants';

import ComponentStack from './ComponentStack';
import FrameList from './FrameList';
import JvmCause from './JvmCause';
import MinifiedStack from './MinifiedStack';
import MissingSourceMap from './MissingSourceMap';
import StackStatusBadge from './StackStatusBadge';
import TruncatedFrames from './TruncatedFrames';

interface StackTraceProps {
	applicationId: string;
	/** Remount per event: the view starts at the event's default. */
	event: RumtypesErrorEventDTO;
	/** A JVM trace of an Android application, retraced with R8 mappings. */
	jvm: boolean;
	onOpenSourceMaps: () => void;
}

function StackTrace({
	applicationId,
	event,
	jvm,
	onOpenSourceMaps,
}: StackTraceProps): JSX.Element {
	const native = jvm && event.source === 'native';
	const words = native
		? STACK_WORDS.native
		: jvm
			? STACK_WORDS.jvm
			: STACK_WORDS.web;
	const { componentStack } = event;
	const exceptionOriginal = defaultStackMode(event) === 'original';
	const canShowOriginal =
		exceptionOriginal ||
		(componentStack !== null && defaultStackMode(componentStack) === 'original');
	const [mode, setMode] = useState<StackMode>(
		canShowOriginal ? 'original' : 'minified',
	);
	const groups = useMemo(
		() => groupFrames(displayFrames(event.frames, 'original', jvm)),
		[event.frames, jvm],
	);
	const causes = jvm ? (event.causes ?? []) : [];
	const firstApp = groups.find((group) => group.kind === 'app')?.key;
	const missing = event.missingSourceMap;

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
					<StackStatusBadge
						words={words}
						sourceMap={resolvingSourceMap(event)}
						missing={missing}
						testId="rum-error"
					/>
				</div>
				<div className="tw:flex tw:items-center tw:gap-1.5">
					{!native && (
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
					)}
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
			{native || (mode === 'original' && exceptionOriginal) ? (
				<>
					<FrameList
						groups={groups}
						label={native ? 'Native stack trace' : 'Original stack trace'}
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
			{event.truncated && <TruncatedFrames testId="rum-error-stack-truncated" />}
			{componentStack && (
				<ComponentStack
					applicationId={applicationId}
					stack={componentStack}
					mode={mode}
					missingShown={Boolean(missing)}
					onOpenSourceMaps={onOpenSourceMaps}
				/>
			)}
		</section>
	);
}

export default StackTrace;
