import { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { Labels } from 'types/api/alerts/def';

export interface LabelChipsInputProps {
	labels: Labels;
	onChange: (labels: Labels) => void;
	/** Returns an error message for a key that may not be used. */
	validateKey?: (key: string) => string | null;
}

export interface LabelDraft {
	key: string;
	value: string;
	error: string | null;
	canAdd: boolean;
	keyRef: RefObject<HTMLInputElement>;
	valueRef: RefObject<HTMLInputElement>;
	onKeyChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onValueChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onKeyKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onValueKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	commit: () => void;
}

export interface LabelChipProps {
	labelKey: string;
	value: string;
	onRemove: (key: string) => void;
}

export interface ClearLabelsDialogProps {
	onConfirm: () => void;
}
