import { useEffect, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { Button } from 'components/ui/button';
import { Check, Link } from 'lucide-react';

/** Copies the page URL, filters and selection included. */
function CopyLinkButton(): JSX.Element {
	const [isCopied, setIsCopied] = useState(false);
	const [, copyToClipboard] = useCopyToClipboard();

	useEffect(() => {
		if (!isCopied) {
			return undefined;
		}
		const timer = setTimeout(() => setIsCopied(false), 1000);
		return (): void => clearTimeout(timer);
	}, [isCopied]);

	return (
		<Button
			variant="outline"
			size="sm"
			data-testid="mq-copy-link"
			onClick={(): void => {
				copyToClipboard(window.location.href);
				setIsCopied(true);
			}}
		>
			{isCopied ? (
				<Check className="tw:text-success" aria-hidden />
			) : (
				<Link aria-hidden />
			)}
			<span className="translate-safe">
				{isCopied ? 'Link copied' : 'Copy link'}
			</span>
		</Button>
	);
}

export default CopyLinkButton;
