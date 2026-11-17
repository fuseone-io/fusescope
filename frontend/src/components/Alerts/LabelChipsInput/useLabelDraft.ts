import { ChangeEvent, KeyboardEvent, useRef, useState } from 'react';

import { LabelChipsInputProps, LabelDraft } from './types';

export function useLabelDraft({
	labels,
	onChange,
	validateKey,
}: LabelChipsInputProps): LabelDraft {
	const [key, setKey] = useState('');
	const [value, setValue] = useState('');
	const [error, setError] = useState<string | null>(null);
	const keyRef = useRef<HTMLInputElement>(null);
	const valueRef = useRef<HTMLInputElement>(null);

	const reset = (): void => {
		setKey('');
		setValue('');
		setError(null);
	};

	const keyError = (candidate: string): string | null => {
		const message = validateKey?.(candidate) ?? null;
		setError(message);
		if (message) {
			keyRef.current?.focus();
		}
		return message;
	};

	const commit = (): void => {
		const nextKey = key.trim();
		const nextValue = value.trim();
		if (!nextKey || !nextValue || keyError(nextKey)) {
			return;
		}
		onChange({ ...labels, [nextKey]: nextValue });
		reset();
		keyRef.current?.focus();
	};

	const onKeyChange = (event: ChangeEvent<HTMLInputElement>): void => {
		setError(null);
		const [head, ...rest] = event.target.value.split(':');
		setKey(head);
		if (rest.length > 0) {
			setValue(rest.join(':') || value);
			valueRef.current?.focus();
		}
	};

	const onKeyKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === 'Escape') {
			reset();
			return;
		}
		if (event.key !== 'Enter') {
			return;
		}
		event.preventDefault();
		if (!key.trim() || keyError(key.trim())) {
			return;
		}
		if (value.trim()) {
			commit();
		} else {
			valueRef.current?.focus();
		}
	};

	const onValueKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === 'Escape') {
			reset();
			keyRef.current?.focus();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		}
	};

	return {
		key,
		value,
		error,
		canAdd: Boolean(key.trim() && value.trim()),
		keyRef,
		valueRef,
		onKeyChange,
		onValueChange: (event): void => setValue(event.target.value),
		onKeyKeyDown,
		onValueKeyDown,
		commit,
	};
}
