import type { RumtypesErrorEventDTO } from 'api/generated/services/fuseScope.schemas';
import { cn } from 'lib/utils';

interface MinifiedStackProps {
	event: RumtypesErrorEventDTO;
	jvm: boolean;
}

const LIBRARY_LINE = /node_modules|vendor|<anonymous>|native/;
const JVM_LIBRARY_LINE =
	/^\s*(at\s+)?(java|javax|jdk|sun|dalvik|libcore|android|androidx|kotlin|kotlinx)\.|^\s*(at\s+)?com\.(android|google\.android)\./;

/** `exception.stacktrace` as the client sent it. */
function MinifiedStack({ event, jvm }: MinifiedStackProps): JSX.Element {
	const library = jvm ? JVM_LIBRARY_LINE : LIBRARY_LINE;
	const lines = (event.stacktrace || `${event.type}: ${event.message}`)
		.split('\n')
		.map((text, position) => ({ id: `${position}:${text}`, text, position }));
	return (
		<pre
			aria-label={jvm ? 'Obfuscated stack trace' : 'Minified stack trace'}
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
							(library.test(line.text)
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
