import { useEffect, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Button } from 'components/ui/button';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
	value: string;
	/** Accessible name; the visible label is "Copy" unless `iconOnly`. */
	label: string;
	iconOnly?: boolean;
	testId?: string;
}

const COPIED_MS = 2000;

function CopyButton({
	value,
	label,
	iconOnly = false,
	testId,
}: CopyButtonProps): JSX.Element {
	const [, copy] = useCopyToClipboard();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) {
			return undefined;
		}
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return (): void => clearTimeout(timer);
	}, [copied]);

	const icon = copied ? <Check /> : <Copy />;
	return (
		<Button
			type="button"
			variant={iconOnly ? 'ghost' : 'outline'}
			size={iconOnly ? 'icon-sm' : 'sm'}
			aria-label={label}
			data-testid={testId}
			onClick={(): void => {
				copy(value);
				setCopied(true);
			}}
		>
			{icon}
			{!iconOnly && (
				<span className="translate-safe">{copied ? 'Copied' : 'Copy'}</span>
			)}
		</Button>
	);
}

export default CopyButton;
