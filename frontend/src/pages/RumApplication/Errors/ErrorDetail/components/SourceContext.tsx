import { contextRows, SourceContext as Context } from 'lib/rum/stackFrames';
import { cn } from 'lib/utils';

interface SourceContextProps {
	context: Context;
	line: number;
}

function SourceContext({ context, line }: SourceContextProps): JSX.Element {
	return (
		<pre
			aria-label={`Source around line ${line}`}
			data-testid="rum-error-frame-context"
			className="tw:m-0 tw:overflow-x-auto tw:border-t tw:border-border tw:bg-surface-sunken tw:py-1.5 tw:font-mono tw:text-xs tw:leading-relaxed"
		>
			{contextRows(context, line).map((row) => (
				<span
					key={row.number}
					data-current={row.current || undefined}
					className={cn(
						'tw:block tw:px-3 tw:whitespace-pre',
						row.current
							? 'tw:bg-error-soft tw:text-foreground'
							: 'tw:text-muted-foreground',
					)}
				>
					<span className="tw:inline-block tw:w-10 tw:pr-3 tw:text-right tw:text-subtle-foreground tw:select-none">
						{row.number}
					</span>
					{row.text}
				</span>
			))}
		</pre>
	);
}

export default SourceContext;
