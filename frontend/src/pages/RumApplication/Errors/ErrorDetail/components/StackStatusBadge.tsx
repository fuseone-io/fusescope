import type { RumtypesMissingSourceMapDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';

import { StackWords } from '../constants';

interface StackStatusBadgeProps {
	words: StackWords;
	/** The map that resolved the stack's frames; empty when none did. */
	sourceMap: string;
	missing: RumtypesMissingSourceMapDTO;
	/** Prefix of the badge's test id, suffixed with its state. */
	testId: string;
}

/** Whether a stack's frames were resolved, and why not. */
function StackStatusBadge({
	words,
	sourceMap,
	missing,
	testId,
}: StackStatusBadgeProps): JSX.Element {
	if (sourceMap) {
		return (
			<StatusBadge tone="success" dot testId={`${testId}-symbolicated`}>
				{words.resolved} · <span className="tw:font-mono">{sourceMap}</span>
			</StatusBadge>
		);
	}
	if (missing) {
		return (
			<StatusBadge tone="warning" dot testId={`${testId}-missing`}>
				{words.raw} · {words.missing} {missing.release}
			</StatusBadge>
		);
	}
	return (
		<StatusBadge tone="neutral" dot testId={`${testId}-unmatched`}>
			{words.raw} · {words.noMatch}
		</StatusBadge>
	);
}

export default StackStatusBadge;
