import { useEffect, useMemo, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Check, ChevronsUpDown, Copy } from 'lucide-react';
import { pluralize } from 'utils/pluralize';

import { groupStackLines, parseStackTrace, StackLine } from './stackTrace';

const LINE_TONE: Record<StackLine['kind'], string> = {
	title: 'tw:font-semibold tw:text-error-ink',
	app: 'tw:font-medium tw:text-foreground',
	library: 'tw:text-subtle-foreground',
	note: 'tw:text-muted-foreground',
};

const COPIED_FEEDBACK_MS = 2000;

interface StackTraceProps {
	text: string;
}

function StackTraceLine({ line }: { line: StackLine }): JSX.Element {
	return (
		<span
			data-testid="stack-trace-line"
			data-kind={line.kind}
			className={cn('tw:block tw:min-h-[1lh]', LINE_TONE[line.kind])}
		>
			{line.text}
		</span>
	);
}

/** An exception's stack trace with its library frames folded away until asked for. */
function StackTrace({ text }: StackTraceProps): JSX.Element {
	const lines = useMemo(() => parseStackTrace(text), [text]);
	const blocks = useMemo(() => groupStackLines(lines), [lines]);
	const hasLibrary = blocks.some((block) => block.kind === 'library');
	const [showLibrary, setShowLibrary] = useState(false);
	const [copied, setCopied] = useState(false);
	const [, copyToClipboard] = useCopyToClipboard();

	useEffect(() => {
		if (!copied) {
			return undefined;
		}
		const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
		return (): void => clearTimeout(timer);
	}, [copied]);

	const handleCopy = (): void => {
		copyToClipboard(text);
		setCopied(true);
	};

	return (
		<section
			aria-labelledby="stack-trace-title"
			data-testid="stack-trace"
			className="fs-ui tw:flex tw:flex-col tw:gap-2.5 tw:px-5 tw:py-4 tw:font-sans"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<h3
					id="stack-trace-title"
					className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
				>
					Stack trace
				</h3>
				{lines.length > 0 && (
					<div className="tw:flex tw:items-center tw:gap-1">
						{hasLibrary && (
							<Button
								variant="ghost"
								size="sm"
								aria-pressed={showLibrary}
								data-testid="stack-trace-library-toggle"
								onClick={(): void => setShowLibrary((shown) => !shown)}
							>
								<ChevronsUpDown aria-hidden="true" />
								<span className="translate-safe">
									{showLibrary ? 'Hide library frames' : 'Show library frames'}
								</span>
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							data-testid="stack-trace-copy"
							onClick={handleCopy}
						>
							{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
							<span className="translate-safe">{copied ? 'Copied' : 'Copy'}</span>
						</Button>
					</div>
				)}
			</div>
			{lines.length === 0 ? (
				<p
					data-testid="stack-trace-empty"
					className="tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-4 tw:py-6 tw:text-center tw:text-[13px] tw:text-muted-foreground"
				>
					No stack trace was recorded with this exception.
				</p>
			) : (
				<pre
					aria-label="Stack trace"
					className="tw:m-0 tw:max-h-[60vh] tw:overflow-auto tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:px-4 tw:py-3 tw:font-mono tw:text-xs tw:leading-relaxed tw:whitespace-pre tw:[font-variant-ligatures:none]"
				>
					{blocks.map((block) => {
						if (block.kind === 'library' && !showLibrary) {
							return (
								<button
									key={block.id}
									type="button"
									data-testid="stack-trace-folded"
									onClick={(): void => setShowLibrary(true)}
									className="tw:my-0.5 tw:block tw:cursor-pointer tw:rounded tw:border-0 tw:bg-muted tw:px-2 tw:font-sans tw:text-[11px] tw:text-muted-foreground tw:hover:text-foreground"
								>
									{pluralize(block.frames || block.lines.length, 'library frame')} hidden
								</button>
							);
						}
						return block.lines.map((line) => (
							<StackTraceLine key={line.id} line={line} />
						));
					})}
				</pre>
			)}
		</section>
	);
}

export default StackTrace;
