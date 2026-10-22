import CopyButton from './CopyButton';

interface SnippetBlockProps {
	code: string;
	label: string;
	testId?: string;
}

function SnippetBlock({ code, label, testId }: SnippetBlockProps): JSX.Element {
	return (
		<div className="tw:relative tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken">
			<pre
				data-testid={testId}
				className="tw:m-0 tw:overflow-x-auto tw:py-3 tw:pr-12 tw:pl-4 tw:font-mono tw:text-xs tw:leading-relaxed tw:whitespace-pre tw:text-foreground"
			>
				{code}
			</pre>
			<div className="tw:absolute tw:top-1.5 tw:right-1.5">
				<CopyButton
					value={code}
					label={label}
					iconOnly
					testId={testId && `${testId}-copy`}
				/>
			</div>
		</div>
	);
}

export default SnippetBlock;
