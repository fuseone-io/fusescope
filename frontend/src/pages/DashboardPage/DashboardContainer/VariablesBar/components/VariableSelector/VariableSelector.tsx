import { useMemo, useState } from 'react';
// eslint-disable-next-line signoz/no-antd-components -- lightweight description tooltip, matches V1
import { Tooltip } from 'antd';
import cx from 'classnames';
import { Link2, Loader2 } from 'lucide-react';

import type { VariableFormModel } from '../../../DashboardSettings/Variables/variableFormModel';
import type {
	VariableSelection,
	VariableSelectionMap,
} from '../../selectionTypes';
import { textDefault } from '../../utils/resolveVariableSelection';
import { selectionTitle } from '../../utils/selectionTitle';
import { computeVariableDependencies } from '../../utils/variableDependencies';
import TextSelector from '../selectors/TextSelector';
import VariableValueControl from '../selectors/VariableValueControl';
import { useVariableFetchState } from '../../hooks/useVariableFetchState';
import styles from './VariableSelector.module.scss';
import VariableTooltip from '../VariableTooltip/VariableTooltip';

interface VariableSelectorProps {
	variable: VariableFormModel;
	/** All variables (Dynamic uses them to scope options by sibling selections). */
	variables: VariableFormModel[];
	/** All current selections (Query passes them as the request payload). */
	selections: VariableSelectionMap;
	selection: VariableSelection;
	onChange: (selection: VariableSelection) => void;
	/** Batched fill applied when options resolve (Query/Dynamic/Custom auto-selection). */
	onAutoSelect: (selection: VariableSelection) => void;
}

/** One `$name | value` pill; dispatches on the variable type. */
function VariableSelector({
	variable,
	variables,
	selections,
	selection,
	onChange,
	onAutoSelect,
}: VariableSelectorProps): JSX.Element {
	// Dependency links shown in the hover tooltip: variables this one's query
	// references (dependsOn = its parents) and query variables that reference this
	// one (usedBy = its children), from the shared dependency graph.
	const { dependsOn, usedBy } = useMemo(() => {
		const { graph, parentGraph } = computeVariableDependencies(variables);
		return {
			dependsOn: parentGraph[variable.name] ?? [],
			usedBy: graph[variable.name] ?? [],
		};
	}, [variable.name, variables]);

	// The full value as a hover hint, off while the control is in use so it
	// never sits over the open list.
	const [hasFocus, setHasFocus] = useState(false);

	const dependsOnLabel = dependsOn.map((parent) => '$' + parent).join(', ');

	const hasTooltip =
		!!variable.description || dependsOn.length > 0 || usedBy.length > 0;

	// Surface the fetch on the pill itself while a QUERY/DYNAMIC variable is
	// loading (or waiting on a parent), without opening the dropdown.
	const { isVariableFetching, isVariableWaiting } = useVariableFetchState(
		variable.name,
	);
	const isFetchingOptions =
		(variable.type === 'QUERY' || variable.type === 'DYNAMIC') &&
		(isVariableFetching || isVariableWaiting);

	const renderControl = (): JSX.Element =>
		variable.type === 'TEXT' ? (
			<TextSelector
				selection={selection}
				defaultValue={textDefault(variable)}
				onChange={onChange}
				testId={`variable-input-${variable.name}`}
			/>
		) : (
			<VariableValueControl
				variable={variable}
				variables={variables}
				selections={selections}
				selection={selection}
				onChange={onChange}
				onAutoSelect={onAutoSelect}
			/>
		);

	const name = (
		<span
			className={cx(styles.variableName, {
				[styles.variableNameHint]: hasTooltip,
			})}
		>
			<span
				className={styles.name}
				title={hasTooltip ? undefined : `$${variable.name}`}
			>
				${variable.name}
			</span>
			{dependsOn.length > 0 ? (
				<Link2
					className={styles.dependencyIcon}
					size={12}
					role="img"
					aria-label={`Depends on ${dependsOnLabel}`}
				/>
			) : null}
		</span>
	);

	return (
		<div
			className={styles.variableItem}
			data-testid={`variable-${variable.name}`}
			aria-busy={isFetchingOptions || undefined}
		>
			{hasTooltip ? (
				<Tooltip
					title={
						<VariableTooltip
							description={variable.description}
							dependsOn={dependsOn}
							usedBy={usedBy}
						/>
					}
				>
					{name}
				</Tooltip>
			) : (
				name
			)}

			<div
				className={styles.variableValue}
				title={hasFocus ? undefined : selectionTitle(selection)}
				onFocus={(): void => setHasFocus(true)}
				onBlur={(event): void => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
						setHasFocus(false);
					}
				}}
			>
				{isFetchingOptions ? (
					<span
						className={styles.loading}
						data-testid={`variable-loading-${variable.name}`}
					>
						<Loader2 size={14} aria-label="Refreshing values..." role="img" />
					</span>
				) : null}
				{renderControl()}
			</div>
		</div>
	);
}

export default VariableSelector;
