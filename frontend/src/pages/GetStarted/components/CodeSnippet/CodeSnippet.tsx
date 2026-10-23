import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Check, Copy } from 'lucide-react';

import { useCopied } from '../../hooks/useCopied';

interface CodeSnippetProps {
	code: string;
	copyLabel: string;
	testId: string;
	/** A file name or caption above the block. */
	label?: string;
	className?: string;
}

/** A monospaced block with a copy button, for commands and config. */
function CodeSnippet({
	code,
	copyLabel,
	testId,
	label,
	className,
}: CodeSnippetProps): JSX.Element {
	const { copied, copy } = useCopied();

	return (
		<div className={cn('tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5', className)}>
			{label && (
				<span className="tw:text-xs tw:text-subtle-foreground">{label}</span>
			)}
			<div className="tw:relative tw:min-w-0 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken">
				<pre
					data-testid={testId}
					className="tw:m-0 tw:overflow-x-auto tw:py-2.5 tw:pr-11 tw:pl-3 tw:font-mono tw:text-xs tw:leading-5 tw:whitespace-pre tw:text-foreground"
				>
					{code}
				</pre>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={copied ? 'Copied' : copyLabel}
					data-testid={`${testId}-copy`}
					onClick={(): void => copy(code)}
					className="tw:absolute tw:top-1.5 tw:right-1.5"
				>
					{copied ? <Check className="tw:text-success-ink" /> : <Copy />}
				</Button>
			</div>
		</div>
	);
}

export default CodeSnippet;
