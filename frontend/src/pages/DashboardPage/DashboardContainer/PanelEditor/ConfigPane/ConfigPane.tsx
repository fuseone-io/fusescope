import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import { Button } from 'components/ui/button';
import { PanelRightClose } from 'lucide-react';
import type {
	DashboardtypesPanelDTO,
	DashboardtypesPanelSpecDTO,
} from 'api/generated/services/fuseScope.schemas';
import { getPanelDefinition } from 'pages/DashboardPage/DashboardContainer/Panels/registry';
import { SectionKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';
import { getSupportedSignals } from 'pages/DashboardPage/DashboardContainer/Panels/capabilities';
import { buildPluginSpec } from 'pages/DashboardPage/DashboardContainer/Panels/utils/buildPluginSpec';
import { resolveSignal } from 'pages/DashboardPage/DashboardContainer/Panels/utils/getBuilderQueries';
import type { EQueryType } from 'types/common/dashboard';

import type { LegendSeries } from 'pages/DashboardPage/DashboardContainer/Panels/utils/legendSeries';
import type { TableColumnOption } from '../hooks/useTableColumns';
import { usePanelEditorChrome } from '../PanelEditorLayout/PanelEditorChromeContext';
import ConfigActions from './ConfigActions/ConfigActions';
import PanelTitleInput from './PanelTitleInput/PanelTitleInput';
import { resolveSectionEditor } from './sectionRegistry';
import SectionSlot from './SectionSlot/SectionSlot';
import SettingsRail from './SettingsRail/SettingsRail';
import { useSectionOpenState } from './useSectionOpenState';

import styles from './ConfigPane.module.scss';
import { PanelKind } from '../../Panels/types/panelKind';

interface ConfigPaneProps {
	/** The panel spec — the single editing surface (title/description + section slices). */
	spec: DashboardtypesPanelSpecDTO;
	/** Last saved spec, the baseline for each section's changed marker. */
	savedSpec: DashboardtypesPanelSpecDTO;
	onChangeSpec: (next: DashboardtypesPanelSpecDTO) => void;
	/** Switch the panel to another visualization kind. */
	onChangePanelKind: (kind: PanelKind) => void;
	originalPanelKind?: PanelKind;
	/**
	 * Active query type from the query-builder provider (the selected tab). Drives which
	 * panel types the visualization switcher disables — read from the provider, not the
	 * spec, because a new panel's spec has no query until staged.
	 */
	queryType: EQueryType;
	/** Panel's resolved series, provided to sections that need them (legend colors). */
	legendSeries: LegendSeries[];
	/** Table panel's resolved value columns, for the table-only editors. */
	tableColumns: TableColumnOption[];
	/** Query step interval (seconds), for the chart-appearance span-gaps floor. */
	stepInterval?: number;
	/**
	 * The draft panel and its id — the "Actions" group seeds cross-page links
	 * (Create alert) from the current query.
	 */
	panel: DashboardtypesPanelDTO;
	panelId: string;
	/** Unit the selected metric was sent with; drives the unit selector's mismatch warning. */
	metricUnit?: string;
}

/**
 * Right-hand configuration pane. Renders the always-present general fields (title +
 * description) followed by the panel kind's configuration sections (Formatting, Axes,
 * …). The section list is declared per kind (`PanelDefinition.sections`) and rendered
 * generically via the section registry — only sections with a built editor appear.
 */
function ConfigPane({
	spec,
	savedSpec,
	onChangeSpec,
	onChangePanelKind,
	originalPanelKind,
	queryType,
	legendSeries,
	tableColumns,
	stepInterval,
	panel,
	panelId,
	metricUnit,
}: ConfigPaneProps): JSX.Element {
	const panelKind = spec.plugin.kind;
	const definition = getPanelDefinition(panelKind);
	// The header toggle belongs with the title and description it hides, so the kind's
	// declaration still gates it but it renders above, out of the display options.
	const headerSection = definition.sections.find(
		(config) => config.kind === SectionKind.PanelHeader,
	);
	const sections = definition.sections.filter(
		(config) => config.kind !== SectionKind.PanelHeader,
	);
	const shownKinds = useMemo(
		() =>
			sections
				.filter(
					(config) =>
						!!resolveSectionEditor(config.kind) && !config.isHidden?.(spec),
				)
				.map((config) => config.kind),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[definition, spec],
	);
	const sectionState = useSectionOpenState(shownKinds, spec);

	const chrome = usePanelEditorChrome();
	const isCollapsed = chrome?.settingsCollapsed ?? false;
	const paneRef = useRef<HTMLDivElement>(null);
	const [scrollTarget, setScrollTarget] = useState<SectionKind | null>(null);

	useEffect(() => {
		if (!scrollTarget || isCollapsed) {
			return;
		}
		paneRef.current
			?.querySelector(`[data-section="${scrollTarget}"]`)
			?.scrollIntoView?.({ block: 'start' });
		setScrollTarget(null);
	}, [scrollTarget, isCollapsed]);

	const openFromRail = useCallback(
		(kind: SectionKind): void => {
			sectionState.openOnly(kind);
			chrome?.setSettingsCollapsed(false);
			setScrollTarget(kind);
		},
		[sectionState, chrome],
	);

	const defaults = useMemo(
		() => buildPluginSpec(definition.sections),
		[definition],
	);

	const signal = resolveSignal(spec.queries, getSupportedSignals(panelKind)[0]);

	// Title/description are just a slice of the spec — edit them through the same
	// onChangeSpec path the sections use, so there's a single editing surface.
	const setDisplayField = (field: 'name' | 'description', value: string): void =>
		onChangeSpec({ ...spec, display: { ...spec.display, [field]: value } });

	if (chrome && isCollapsed) {
		return (
			<SettingsRail
				sections={shownKinds}
				onExpand={(): void => chrome.setSettingsCollapsed(false)}
				onOpenSection={openFromRail}
			/>
		);
	}

	return (
		<div
			className={styles.config}
			ref={paneRef}
			data-testid="panel-editor-settings"
		>
			<header className={`fs-ui ${styles.heading}`}>
				<h2 className={styles.headingTitle}>Panel Details</h2>
				<div className={styles.headingActions}>
					{sectionState.isAnyOpen && (
						<Button
							variant="ghost"
							size="sm"
							data-testid="panel-editor-collapse-sections"
							onClick={sectionState.collapseAll}
						>
							Collapse all
						</Button>
					)}
					{chrome && (
						<Button
							variant="ghost"
							size="icon-sm"
							className="tw:text-muted-foreground"
							aria-label="Collapse panel settings"
							data-testid="panel-editor-collapse-settings"
							onClick={(): void => chrome.setSettingsCollapsed(true)}
						>
							<PanelRightClose />
						</Button>
					)}
				</div>
			</header>

			<div className={styles.group}>
				<div className={styles.field}>
					<span className={styles.label}>Title</span>
					<PanelTitleInput
						value={spec.display.name}
						onChange={(value): void => setDisplayField('name', value)}
					/>
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Description</span>
					<Input.TextArea
						data-testid="panel-editor-v2-description"
						value={spec.display.description ?? ''}
						placeholder="Add a description"
						rows={2}
						onChange={(e): void => setDisplayField('description', e.target.value)}
					/>
				</div>

				{headerSection && (
					<SectionSlot
						bare
						config={headerSection}
						spec={spec}
						savedSpec={savedSpec}
						onChangeSpec={onChangeSpec}
						defaults={defaults}
						legendSeries={legendSeries}
						tableColumns={tableColumns}
						signal={signal}
						panelKind={panelKind}
						onChangePanelKind={onChangePanelKind}
						originalPanelKind={originalPanelKind}
						queryType={queryType}
						stepInterval={stepInterval}
						metricUnit={metricUnit}
					/>
				)}
			</div>

			{sections.length > 0 && (
				<>
					<div className={styles.divider} />
					<div className={styles.sectionsContainer}>
						<span className={styles.eyebrow}>Display options</span>
						<div className={styles.sections}>
							{sections.map((config) => (
								<SectionSlot
									key={config.kind}
									config={config}
									open={sectionState.isOpen(config.kind)}
									onOpenChange={(open): void => sectionState.setOpen(config.kind, open)}
									spec={spec}
									savedSpec={savedSpec}
									onChangeSpec={onChangeSpec}
									defaults={defaults}
									legendSeries={legendSeries}
									tableColumns={tableColumns}
									signal={signal}
									panelKind={panelKind}
									onChangePanelKind={onChangePanelKind}
									originalPanelKind={originalPanelKind}
									queryType={queryType}
									stepInterval={stepInterval}
									metricUnit={metricUnit}
								/>
							))}
						</div>
					</div>
				</>
			)}

			<ConfigActions panel={panel} panelId={panelId} />
		</div>
	);
}

export default ConfigPane;
