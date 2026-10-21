import type { NewPanelTarget } from '../../patchOps';
import type { DashboardSection } from '../../utils';

export interface PanelEditorCrumbs {
	dashboard: string;
	/** Absent when the panel sits at the dashboard's untitled top level. */
	section?: string;
	panel: string;
}

export interface PanelEditorCrumbsInput {
	dashboardName: string;
	sections: DashboardSection[];
	panelId: string;
	panelTitle: string;
	isNew: boolean;
	target?: NewPanelTarget;
}

function sectionTitle({
	sections,
	panelId,
	isNew,
	target,
}: PanelEditorCrumbsInput): string | undefined {
	if (isNew) {
		if (target?.type === 'newSection') {
			return target.title;
		}
		if (target?.type === 'section') {
			return sections.find((s) => s.layoutIndex === target.layoutIndex)?.title;
		}
		return undefined;
	}
	return sections.find((s) => s.items.some((item) => item.id === panelId))
		?.title;
}

/** Where the edited panel lives: dashboard › section › panel. */
export function panelEditorCrumbs(
	input: PanelEditorCrumbsInput,
): PanelEditorCrumbs {
	const title = input.panelTitle.trim();
	return {
		dashboard: input.dashboardName.trim() || 'Dashboard',
		section: sectionTitle(input) || undefined,
		panel: title || (input.isNew ? 'New panel' : 'Untitled panel'),
	};
}
