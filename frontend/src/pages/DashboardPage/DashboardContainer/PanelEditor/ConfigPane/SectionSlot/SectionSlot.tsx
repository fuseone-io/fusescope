import { type ReactNode, useCallback, useRef, useState } from 'react';
import type { DashboardtypesPanelSpecDTO } from 'api/generated/services/fuseScope.schemas';
import {
	type PanelFormattingSlice,
	SECTION_METADATA,
	type SectionConfig,
	SectionKind,
} from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';
import type { SeededPluginSpec } from 'pages/DashboardPage/DashboardContainer/Panels/utils/buildPluginSpec';

import type { SectionEditorContext } from '../sectionContext';
import { getSectionDefault, resolveSectionEditor } from '../sectionRegistry';
import SettingsSection from '../SettingsSection/SettingsSection';
import { isDifferent } from '../utils/changes';
import { isSectionInitiallyOpen } from '../utils/sectionOpen';
import {
	type SectionSummaryInput,
	summarizeSection,
} from '../utils/sectionSummary';
import SectionHeaderQuickAdd from './SectionHeaderQuickAdd';

type SectionSlotProps = {
	config: SectionConfig;
	spec: DashboardtypesPanelSpecDTO;
	/** Last saved spec; a section whose slice differs from it is marked changed. */
	savedSpec: DashboardtypesPanelSpecDTO;
	onChangeSpec: (next: DashboardtypesPanelSpecDTO) => void;
	/** The kind's seeded plugin spec (`buildPluginSpec`). */
	defaults: SeededPluginSpec;
	/** Renders the editor alone, for a section promoted into the Panel Details fields. */
	bare?: boolean;
	/** Controlled open state, so the pane can collapse every section at once. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
} & Omit<SectionEditorContext, 'yAxisUnit' | 'registerHeaderAction'>;

// Per-section header content; `trigger` expands the section and runs the editor's handler.
const SECTION_HEADER_SLOT: Partial<
	Record<SectionKind, (trigger: () => void) => ReactNode>
> = {
	[SectionKind.Thresholds]: (trigger): ReactNode => (
		<SectionHeaderQuickAdd
			action={{
				label: 'Add Threshold',
				testId: 'panel-editor-v2-add-threshold-header',
			}}
			onClick={trigger}
		/>
	),
	[SectionKind.ContextLinks]: (trigger): ReactNode => (
		<SectionHeaderQuickAdd
			action={{
				label: 'Add Context Link',
				testId: 'panel-editor-v2-add-link-header',
			}}
			onClick={trigger}
		/>
	),
};

/**
 * Renders one configuration section: its collapsible wrapper plus the registered editor
 * for `config.kind`. Renders nothing when the kind has no editor yet.
 */
function SectionSlot({
	config,
	spec,
	savedSpec,
	onChangeSpec,
	defaults,
	bare,
	open: controlledOpen,
	onOpenChange,
	legendSeries,
	tableColumns,
	signal,
	panelKind,
	onChangePanelKind,
	originalPanelKind,
	queryType,
	stepInterval,
	metricUnit,
}: SectionSlotProps): JSX.Element | null {
	const editor = resolveSectionEditor(config.kind);
	// Controlled so the header slot can expand on click; list sections open when populated.
	const [internalOpen, setInternalOpen] = useState(() =>
		isSectionInitiallyOpen(config.kind, editor?.get(spec)),
	);
	const open = controlledOpen ?? internalOpen;
	const setOpen = useCallback(
		(next: boolean): void => {
			if (onOpenChange) {
				onOpenChange(next);
			} else {
				setInternalOpen(next);
			}
		},
		[onOpenChange],
	);
	// The editor mounts only while open, so a collapsed-click defers the handler until it registers.
	const actionHandlerRef = useRef<(() => void) | null>(null);
	const pendingActionRef = useRef(false);

	const registerHeaderAction = useCallback(
		(handler: (() => void) | null): void => {
			actionHandlerRef.current = handler;
			if (handler && pendingActionRef.current) {
				pendingActionRef.current = false;
				handler();
			}
		},
		[],
	);

	const triggerHeaderAction = useCallback((): void => {
		setOpen(true);
		if (actionHandlerRef.current) {
			actionHandlerRef.current();
		} else {
			pendingActionRef.current = true;
		}
	}, [setOpen]);

	if (config.isHidden?.(spec)) {
		return null;
	}

	if (!editor) {
		return null;
	}

	const { title } = SECTION_METADATA[config.kind];
	const { Component, get, update } = editor;
	const value = get(spec);
	const defaultValue = getSectionDefault(editor, spec, defaults);
	const savedValue = get(savedSpec);
	// Atomic sections carry no `controls`; controlled ones do.
	const controls = 'controls' in config ? config.controls : undefined;
	// Forwarded to editors that scope to the panel's unit (e.g. the thresholds unit picker).
	const yAxisUnit = (spec.plugin.spec as { formatting?: PanelFormattingSlice })
		.formatting?.unit;

	const headerSlot = SECTION_HEADER_SLOT[config.kind]?.(triggerHeaderAction);

	const context: SectionEditorContext = {
		legendSeries,
		yAxisUnit,
		tableColumns,
		signal,
		panelKind,
		onChangePanelKind,
		originalPanelKind,
		queryType,
		stepInterval,
		metricUnit,
	};

	const editorElement = (
		<Component
			value={value}
			defaultValue={defaultValue}
			savedValue={savedValue}
			controls={controls}
			onChange={(next): void => onChangeSpec(update(spec, next))}
			{...context}
			registerHeaderAction={registerHeaderAction}
		/>
	);

	if (bare) {
		return editorElement;
	}

	// The descriptor erases the kind; `value` and `controls` are this kind's.
	const summary = summarizeSection({
		kind: config.kind,
		value,
		defaultValue,
		controls,
		panelKind: panelKind ?? spec.plugin.kind,
		legendSeriesCount: legendSeries?.length ?? 0,
	} as SectionSummaryInput);

	return (
		<SettingsSection
			title={title}
			changed={isDifferent(value, savedValue)}
			open={open}
			onOpenChange={setOpen}
			summary={summary}
			headerSlot={headerSlot}
			sectionId={config.kind}
		>
			{editorElement}
		</SettingsSection>
	);
}

export default SectionSlot;
