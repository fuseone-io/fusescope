import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopyToClipboard } from 'react-use';

const COPIED_FOR_MS = 1500;

/** Copies text and reports `copied` for a moment afterwards. */
export function useCopied(): { copied: boolean; copy: (text: string) => void } {
	const [, copyToClipboard] = useCopyToClipboard();
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => (): void => clearTimeout(timer.current), []);

	const copy = useCallback(
		(text: string): void => {
			copyToClipboard(text);
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
		},
		[copyToClipboard],
	);

	return { copied, copy };
}
