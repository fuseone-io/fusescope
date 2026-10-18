import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { IOption } from 'hooks/useResourceAttribute/types';

interface OptionListState {
	visible: IOption[];
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/** Filters `options` by `search` and drives the active option from the keyboard. */
export function useOptionList(
	options: IOption[],
	search: string,
	onPick: (option: IOption) => void,
): OptionListState {
	const [activeIndex, setActiveIndex] = useState(0);

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return needle
			? options.filter((option) => option.label.toLowerCase().includes(needle))
			: options;
	}, [options, search]);

	useEffect(() => {
		setActiveIndex(0);
	}, [visible]);

	const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
		if (visible.length === 0) {
			return;
		}
		const last = visible.length - 1;
		const moves: Record<string, number> = {
			ArrowDown: activeIndex >= last ? 0 : activeIndex + 1,
			ArrowUp: activeIndex <= 0 ? last : activeIndex - 1,
			Home: 0,
			End: last,
		};

		if (event.key in moves) {
			event.preventDefault();
			setActiveIndex(moves[event.key]);
		} else if (event.key === 'Enter' && visible[activeIndex]) {
			event.preventDefault();
			onPick(visible[activeIndex]);
		}
	};

	return { visible, activeIndex, setActiveIndex, onKeyDown };
}
