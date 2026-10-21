import { useMemo } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';

import {
	VARIABLE_TYPE_EVENT_LABEL,
	type VariableFormModel,
} from '../../../DashboardSettings/Variables/variableFormModel';
import type {
	VariableSelection,
	VariableSelectionMap,
} from '../../selectionTypes';
import {
	reconcileWithOptions,
	resolveDefaultSelection,
} from '../../utils/resolveVariableSelection';
import { useAutoSelect } from '../../hooks/useAutoSelect';
import ValueSelector from './ValueSelector';
import { useVariableOptions } from '../../hooks/useVariableOptions';
import styles from '../VariableSelector/VariableSelector.module.scss';

interface VariableValueControlProps {
	variable: VariableFormModel;
	/** All variables (Dynamic scopes its options by sibling selections). */
	variables: VariableFormModel[];
	/** All current selections (fed to the Query request payload). */
	selections: VariableSelectionMap;
	selection: VariableSelection;
	onChange: (selection: VariableSelection) => void;
	/** Batched auto-selection fill applied when options resolve. */
	onAutoSelect: (selection: VariableSelection) => void;
}

/**
 * The single value picker for QUERY / CUSTOM / DYNAMIC variables. Options + fetch
 * state come from {@link useVariableOptions}; this component only reconciles the
 * selection against the options and renders — the view is decoupled from how the
 * options are sourced (Container/Presentational).
 */
function VariableValueControl({
	variable,
	variables,
	selections,
	selection,
	onChange,
	onAutoSelect,
}: VariableValueControlProps): JSX.Element {
	const { options, loading, errorMessage, onRetry, isRetryable, dynamic } =
		useVariableOptions(variable, variables, selections);

	useAutoSelect(variable, options, selection, onAutoSelect);

	// The selection to fall back to when the multi-select closes empty
	const emptyFallback = useMemo<VariableSelection>(() => {
		const seed = resolveDefaultSelection(variable);
		return reconcileWithOptions(variable, seed, options) ?? seed;
	}, [variable, options]);

	return (
		<>
			{errorMessage ? (
				<span className={styles.errorIcon} title={errorMessage} data-variable-error>
					<TriangleAlert size={14} role="img" aria-label="Couldn't load values" />
				</span>
			) : null}
			<ValueSelector
				options={options}
				variableType={VARIABLE_TYPE_EVENT_LABEL[variable.type]}
				multiSelect={variable.multiSelect}
				showAllOption={variable.showAllOption}
				loading={loading}
				errorMessage={errorMessage}
				onRetry={onRetry}
				isRetryable={isRetryable}
				dynamic={dynamic}
				selection={selection}
				onChange={onChange}
				emptyFallback={emptyFallback}
				testId={`variable-select-${variable.name}`}
			/>
			{errorMessage && onRetry && isRetryable !== false ? (
				<button
					type="button"
					className={styles.retry}
					title="Retry"
					aria-label="Retry"
					data-testid={`variable-retry-${variable.name}`}
					onClick={onRetry}
				>
					<RotateCw size={14} aria-hidden="true" />
				</button>
			) : null}
		</>
	);
}

export default VariableValueControl;
