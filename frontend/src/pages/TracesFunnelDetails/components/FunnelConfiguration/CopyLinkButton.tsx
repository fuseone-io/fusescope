import { useEffect, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Button } from 'components/ui/button';
import { CircleCheck, Copy } from 'lucide-react';

function CopyLinkButton(): JSX.Element {
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!state.value) {
			return undefined;
		}
		setCopied(true);
		const timer = setTimeout(() => setCopied(false), 1000);
		return (): void => clearTimeout(timer);
	}, [state]);

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={copied ? 'Copied' : 'Copy link'}
			title={copied ? 'Copied' : 'Copy link'}
			onClick={(): void => copyToClipboard(window.location.href)}
			className="tw:text-muted-foreground tw:hover:text-foreground"
		>
			{copied ? <CircleCheck className="tw:text-success" /> : <Copy />}
		</Button>
	);
}

export default CopyLinkButton;
