import { ChevronLeft } from 'lucide-react';
import { Button } from 'components/ui/button';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import cx from 'classnames';
import type { DashboardtypesGettableDashboardV2DTO } from 'api/generated/services/fuseScope.schemas';
import { useInlineOverflowCount } from 'hooks/useInlineOverflowCount';

import { selectVariablesExpanded } from '../store/slices/collapseSlice';
import { useDashboardStore } from '../store/useDashboardStore';
import AddVariableFull from './components/AddVariable/AddVariableFull';
import AddVariableIcon from './components/AddVariable/AddVariableIcon';

import HiddenVariablesTooltip from './components/HiddenVariablesTooltip/HiddenVariablesTooltip';
import { useVariableSelection } from './hooks/useVariableSelection';
import { resolveDefaultSelection } from './utils/resolveVariableSelection';
import VariableSelector from './components/VariableSelector/VariableSelector';
import styles from './VariablesBar.module.scss';
import { useDashboardEditContext } from '../hooks/useDashboardEditContext';

interface VariablesBarProps {
	dashboard: DashboardtypesGettableDashboardV2DTO;
}

/**
 * Runtime variable selector bar shown above the panels. Renders one control per
 * dashboard variable; selections live in the store + URL (never the spec).
 *
 * The pills sit on one line and collapse the overflow behind a `+N` trigger.
 * Expanding lets the bar wrap onto further lines. Every selector stays mounted
 * either way so auto-selection and option fetching keep driving the panels.
 */
function VariablesBar({ dashboard }: VariablesBarProps): JSX.Element | null {
	const dashboardId = dashboard.id ?? '';
	const { isEditable, editChecks, editDisabledTooltip } =
		useDashboardEditContext();
	const { variables, selection, setSelection, autoSelect } =
		useVariableSelection(dashboard);
	// Persisted per dashboard so the full/collapsed view survives reloads.
	const expanded = useDashboardStore(selectVariablesExpanded(dashboardId));
	const setVariablesExpanded = useDashboardStore((s) => s.setVariablesExpanded);
	const { containerRef, visibleCount, overflowCount } = useInlineOverflowCount({
		itemCount: variables.length,
		gap: 8,
		// Reserve room for the "+N" trigger and "Add variable" so both stay on one line.
		reserveWidth: isEditable ? 176 : 48,
		enabled: !expanded,
	});

	// Editors can add a variable even before any exist; viewers with no variables
	// have nothing to show.
	if (variables.length === 0 && !isEditable) {
		return null;
	}

	const hasOverflow = overflowCount > 0;
	const hiddenVariables =
		!expanded && hasOverflow ? variables.slice(visibleCount) : [];

	const moreButton = (
		<Button
			type="button"
			variant="outline"
			size="sm"
			aria-expanded={expanded}
			data-testid="dashboard-variables-more"
			className="fs-ui tw:rounded-lg tw:border-input tw:bg-surface-raised tw:font-sans tw:shadow-xs tw:dark:bg-surface-raised"
			onClick={(): void => setVariablesExpanded(dashboardId, !expanded)}
		>
			{expanded && <ChevronLeft />}
			<span>{expanded ? 'Less' : `+${overflowCount}`}</span>
		</Button>
	);

	if (variables.length === 0) {
		return (
			<div className={styles.bar} data-testid="dashboard-variables-bar">
				<AddVariableFull />
			</div>
		);
	}

	return (
		<div className={styles.bar} data-testid="dashboard-variables-bar">
			<div
				ref={containerRef}
				className={cx(styles.strip, { [styles.stripExpanded]: expanded })}
			>
				{variables.map((variable, index) => (
					<div
						key={variable.name}
						data-overflow-item="true"
						className={cx(styles.variableSlot, {
							[styles.variableSlotHidden]:
								!expanded && hasOverflow && index >= visibleCount,
						})}
					>
						<VariableSelector
							variable={variable}
							variables={variables}
							selections={selection}
							// Until the seed commits a selection, stand in the same default it will
							// commit, through the one resolver — an empty stand-in reads as "nothing
							// selected" to a control that snapshots it on mount.
							selection={selection[variable.name] ?? resolveDefaultSelection(variable)}
							onChange={(next): void => setSelection(variable.name, next)}
							onAutoSelect={(next): void => autoSelect(variable.name, next)}
						/>
					</div>
				))}

				{(expanded || hasOverflow) && (
					<span className={styles.moreButton}>
						{expanded ? (
							moreButton
						) : (
							<TitleTooltip
								side="top"
								title={
									<HiddenVariablesTooltip
										variables={hiddenVariables}
										selections={selection}
									/>
								}
							>
								{moreButton}
							</TitleTooltip>
						)}
					</span>
				)}

				{/* After the more/less trigger, in every state. Always mounted so
				    measuring never toggles it. */}
				<span className={styles.addSlot}>
					<AddVariableIcon
						checks={editChecks}
						disabledTooltip={editDisabledTooltip}
						isEditable={isEditable}
					/>
				</span>
			</div>
		</div>
	);
}

export default VariablesBar;
