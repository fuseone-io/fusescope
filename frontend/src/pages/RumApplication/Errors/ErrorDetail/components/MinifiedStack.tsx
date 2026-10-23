import type { RumtypesErrorEventDTO } from 'api/generated/services/fuseScope.schemas';
import { cn } from 'lib/utils';

interface MinifiedStackProps {
	event: RumtypesErrorEventDTO;
}

const LIBRARY_LINE = /node_modules|vendor|<anonymous>|native/;

/** `exception.stacktrace` as the browser sent it. */
function MinifiedStack({ event }: MinifiedStackProps): JSX.Element {
	const lines = (event.stacktrace || `${event.type}: ${event.message}`)
		.split('\n')
		.map((text, position) => ({ id: `${position}:${text}`, text, position }));
	return (
		<pre
			aria-label="Minified stack trace"
			data-testid="rum-error-minified"
			className="tw:m-0 tw:overflow-x-auto tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:px-3 tw:py-2.5 tw:font-mono tw:text-xs tw:leading-relaxed"
		>
			{lines.map((line) => (
				<span
					key={line.id}
					className={cn(
						'tw:block tw:whitespace-pre',
						line.position === 0 && 'tw:font-semibold tw:text-error-ink',
						line.position > 0 &&
							(LIBRARY_LINE.test(line.text)
								? 'tw:text-subtle-foreground'
								: 'tw:text-foreground'),
					)}
				>
					{line.text}
				</span>
			))}
		</pre>
	);
}

export default MinifiedStack;
