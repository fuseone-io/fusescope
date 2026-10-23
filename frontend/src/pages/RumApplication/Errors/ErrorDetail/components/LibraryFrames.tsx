import { useState } from 'react';
import { DisplayFrame, frameLocation } from 'lib/rum/stackFrames';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface LibraryFramesProps {
	frames: DisplayFrame[];
	label: string;
}

/** A run of dependency or browser frames, collapsed until asked for. */
function LibraryFrames({ frames, label }: LibraryFramesProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const Icon = open ? ChevronDown : ChevronRight;
	const rows = frames.map((frame, position) => ({
		frame,
		id: `${position}:${frame.function}:${frameLocation(frame)}`,
	}));
	return (
		<li data-testid="rum-error-library-frames">
			<button
				type="button"
				aria-expanded={open}
				onClick={(): void => setOpen((current) => !current)}
				className="tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-md tw:border-0 tw:bg-transparent tw:px-2 tw:py-1 tw:text-xs tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground"
			>
				<Icon aria-hidden="true" className="tw:size-3.5" />
				<span className="translate-safe">{`${open ? 'Hide' : 'Show'} ${label}`}</span>
			</button>
			{open && (
				<ol className="tw:m-0 tw:mt-1 tw:flex tw:list-none tw:flex-col tw:gap-0.5 tw:border-l tw:border-border tw:py-0.5 tw:pr-0 tw:pl-3 tw:ml-3.5">
					{rows.map(({ frame, id }) => (
						<li
							key={id}
							data-testid="rum-error-library-frame"
							className="tw:flex tw:min-w-0 tw:gap-2 tw:font-mono tw:text-[11px] tw:text-subtle-foreground"
						>
							<span className="tw:flex-none tw:text-muted-foreground">
								{frame.function || '<anonymous>'}
							</span>
							<span className="tw:truncate">{frameLocation(frame)}</span>
						</li>
					))}
				</ol>
			)}
		</li>
	);
}

export default LibraryFrames;
