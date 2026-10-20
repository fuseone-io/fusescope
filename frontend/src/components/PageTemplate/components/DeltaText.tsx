import { ReactNode } from 'react';
import { cn } from 'lib/utils';

export type DeltaTextTone = 'bad' | 'good' | 'neutral';

const TONE_CLASSES: Record<DeltaTextTone, string> = {
	bad: 'tw:text-error tw:dark:text-error-ink',
	good: 'tw:text-success tw:dark:text-success-ink',
	neutral: 'tw:text-subtle-foreground',
};

interface DeltaTextProps {
	text: string;
	tone: DeltaTextTone;
	/** The previous value, shown after the change as "vs …". */
	previous?: ReactNode;
	className?: string;
	testId?: string;
}

/** A change against the previous period, coloured when it is notable. */
function DeltaText({
	text,
	tone,
	previous,
	className,
	testId,
}: DeltaTextProps): JSX.Element {
	return (
		<span
			data-testid={testId}
			data-tone={tone}
			className={cn(
				'tw:text-xs tw:font-medium tw:tabular-nums',
				TONE_CLASSES[tone],
				className,
			)}
		>
			{text}
			{previous !== undefined && (
				<>
					{' '}
					<span className="tw:font-normal tw:whitespace-nowrap tw:text-subtle-foreground">
						vs {previous}
					</span>
				</>
			)}
		</span>
	);
}

export default DeltaText;
