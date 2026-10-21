import { useMemo } from 'react';

import { useDashboardFetchRequired } from '../../hooks/useDashboardFetchRequired';
import { useDashboardSections } from '../../hooks/useDashboardSections';
import type { NewPanelTarget } from '../../patchOps';
import { type PanelEditorCrumbs, panelEditorCrumbs } from './breadcrumb';

export function usePanelEditorCrumbs({
	panelId,
	panelTitle,
	isNew,
	target,
}: {
	panelId: string;
	panelTitle: string;
	isNew: boolean;
	target?: NewPanelTarget;
}): PanelEditorCrumbs {
	const { dashboard } = useDashboardFetchRequired();
	const sections = useDashboardSections();
	const dashboardName = dashboard.spec.display.name;

	return useMemo(
		() =>
			panelEditorCrumbs({
				dashboardName,
				sections,
				panelId,
				panelTitle,
				isNew,
				target,
			}),
		[dashboardName, sections, panelId, panelTitle, isNew, target],
	);
}
