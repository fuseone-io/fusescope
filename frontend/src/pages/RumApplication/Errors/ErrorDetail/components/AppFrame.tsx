import { useState } from 'react';
import { DisplayFrame, frameLocation } from 'lib/rum/stackFrames';
import { cn } from 'lib/utils';
import { ChevronRight } from 'lucide-react';

import SourceContext from './SourceContext';

interface AppFrameProps {
	frame: DisplayFrame;
	/** The source shows until toggled. */
	initiallyOpen: boolean;
}

function AppFrame({ frame, initiallyOpen }: AppFrameProps): JSX.Element {
	const [open, setOpen] = useState(initiallyOpen);
	const { context } = frame;
	const title = (
		<>
			<span className="tw:font-mono tw:font-semibold tw:text-foreground">
				{frame.function || '<anonymous>'}
			</span>
			<span className="tw:min-w-0 tw:truncate tw:font-mono tw:text-muted-foreground">
				{frameLocation(frame)}
			</span>
			<span className="tw:flex-1" />
			{frame.inlined && (
				<span
					title="R8 inlined this method into the frame below"
					className="tw:inline-flex tw:h-5 tw:flex-none tw:items-center tw:rounded-sm tw:bg-primary-soft tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-primary-ink"
				>
					inlined
				</span>
			)}
			<span className="tw:inline-flex tw:h-5 tw:flex-none tw:items-center tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-muted-foreground">
				in app
			</span>
		</>
	);
	const row =
		'tw:flex tw:w-full tw:min-w-0 tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-left tw:text-xs';
	return (
		<li
			data-testid="rum-error-frame"
			className="tw:overflow-hidden tw:rounded-lg tw:border tw:border-border"
		>
			{context ? (
				<button
					type="button"
					aria-expanded={open}
					onClick={(): void => setOpen((current) => !current)}
					className={cn(
						row,
						'tw:cursor-pointer tw:border-0 tw:bg-transparent tw:hover:bg-muted/60',
					)}
				>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							'tw:size-3.5 tw:flex-none tw:text-subtle-foreground tw:transition-transform',
							open && 'tw:rotate-90',
						)}
					/>
					{title}
				</button>
			) : (
				<div className={cn(row, 'tw:pl-8')}>{title}</div>
			)}
			{context && open && <SourceContext context={context} line={frame.line} />}
		</li>
	);
}

export default AppFrame;
