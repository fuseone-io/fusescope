import { useCallback, useRef, useState } from 'react';
import type { DashboardtypesPanelSpecDTO } from 'api/generated/services/fuseScope.schemas';
import type { SectionKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';

import { resolveSectionEditor } from './sectionRegistry';
import { isSectionInitiallyOpen } from './utils/sectionOpen';

type OpenMap = Partial<Record<SectionKind, boolean>>;

/**
 * Which config sections are open. A section starts as `isSectionInitiallyOpen`
 * reads it the first time it appears (also after a kind switch), then follows
 * the user.
 */
export function useSectionOpenState(
	kinds: SectionKind[],
	spec: DashboardtypesPanelSpecDTO,
): {
	isOpen: (kind: SectionKind) => boolean;
	setOpen: (kind: SectionKind, open: boolean) => void;
	collapseAll: () => void;
	openOnly: (kind: SectionKind) => void;
	isAnyOpen: boolean;
} {
	const initial = useRef<OpenMap>({});
	kinds.forEach((kind) => {
		if (initial.current[kind] === undefined) {
			initial.current[kind] = isSectionInitiallyOpen(
				kind,
				resolveSectionEditor(kind)?.get(spec),
			);
		}
	});
	const [chosen, setChosen] = useState<OpenMap>({});

	const isOpen = useCallback(
		(kind: SectionKind): boolean =>
			chosen[kind] ?? initial.current[kind] ?? false,
		[chosen],
	);

	const setOpen = useCallback((kind: SectionKind, open: boolean): void => {
		setChosen((prev) => ({ ...prev, [kind]: open }));
	}, []);

	const collapseAll = useCallback((): void => {
		setChosen(Object.fromEntries(kinds.map((kind) => [kind, false])));
	}, [kinds]);

	const openOnly = useCallback(
		(target: SectionKind): void => {
			setChosen(Object.fromEntries(kinds.map((kind) => [kind, kind === target])));
		},
		[kinds],
	);

	return {
		isOpen,
		setOpen,
		collapseAll,
		openOnly,
		isAnyOpen: kinds.some(isOpen),
	};
}
