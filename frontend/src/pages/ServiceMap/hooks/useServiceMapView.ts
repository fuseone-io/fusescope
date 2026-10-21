import { useCallback, useState } from 'react';

import { ColorMode } from '../types';

interface ServiceMapView {
	selected: string | null;
	hovered: string | null;
	colorMode: ColorMode;
	showDependencies: boolean;
	search: string;
	highlightPath: boolean;
	select: (id: string) => void;
	setHovered: (id: string | null) => void;
	setColorMode: (mode: ColorMode) => void;
	setShowDependencies: (show: boolean) => void;
	setSearch: (term: string) => void;
	toggleHighlightPath: () => void;
}

/** The map's view state; selecting the selected node again clears it. */
export function useServiceMapView(): ServiceMapView {
	const [selected, setSelected] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);
	const [colorMode, setColorMode] = useState<ColorMode>('health');
	const [showDependencies, setShowDependencies] = useState(true);
	const [search, setSearch] = useState('');
	const [highlightPath, setHighlightPath] = useState(false);

	const select = useCallback((id: string) => {
		setHighlightPath(false);
		setSelected((current) => (current === id ? null : id));
	}, []);

	return {
		selected,
		hovered,
		colorMode,
		showDependencies,
		search,
		highlightPath,
		select,
		setHovered,
		setColorMode,
		setShowDependencies,
		setSearch,
		toggleHighlightPath: useCallback(
			() => setHighlightPath((current) => !current),
			[],
		),
	};
}
