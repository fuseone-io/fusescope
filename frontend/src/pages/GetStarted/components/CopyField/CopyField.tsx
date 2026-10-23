import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { Check, Copy } from 'lucide-react';

import { useCopied } from '../../hooks/useCopied';

interface CopyFieldProps {
	value: string;
	/** Names the copy button: "Copy OTLP HTTP endpoint". */
	copyLabel: string;
	testId: string;
	/** Drawn instead of the value, e.g. a skeleton while it loads. */
	children?: ReactNode;
}

/** A sunken one-line value with a copy button. */
function CopyField({
	value,
	copyLabel,
	testId,
	children,
}: CopyFieldProps): JSX.Element {
	const { copied, copy } = useCopied();

	return (
		<div className="tw:flex tw:h-9 tw:min-w-0 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:pr-1 tw:pl-2.5">
			<span
				data-testid={testId}
				className="tw:min-w-0 tw:flex-1 tw:truncate tw:font-mono tw:text-xs"
				title={value}
			>
				{children ?? value}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label={copied ? 'Copied' : copyLabel}
				data-testid={`${testId}-copy`}
				disabled={!value}
				onClick={(): void => copy(value)}
			>
				{copied ? <Check className="tw:text-success-ink" /> : <Copy />}
			</Button>
		</div>
	);
}

export default CopyField;
