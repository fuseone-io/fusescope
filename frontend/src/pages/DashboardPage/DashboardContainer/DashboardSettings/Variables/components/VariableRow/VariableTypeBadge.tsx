import type { VariableType } from '../../variableFormModel';
import {
	BADGE_INFO,
	BADGE_NEUTRAL,
	BADGE_WARNING,
} from '../../../components/settingsClassNames';

const TYPE_BADGE: Record<VariableType, { label: string; className: string }> = {
	DYNAMIC: { label: 'Dynamic', className: BADGE_INFO },
	QUERY: { label: 'Query', className: BADGE_WARNING },
	CUSTOM: { label: 'Custom', className: BADGE_NEUTRAL },
	TEXT: { label: 'Textbox', className: BADGE_NEUTRAL },
};

/** The variable's type, coloured like the editor's type picker. */
function VariableTypeBadge({ type }: { type: VariableType }): JSX.Element {
	const { label, className } = TYPE_BADGE[type];
	return <span className={className}>{label}</span>;
}

export default VariableTypeBadge;
