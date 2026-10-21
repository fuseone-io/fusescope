import { Button } from 'components/ui/button';
import { AlignLeft, Copy, Download, RotateCcw } from 'lucide-react';

import {
	BUTTON_GHOST,
	BUTTON_OUTLINE,
} from '../../DashboardSettings/components/settingsClassNames';
import DisabledReason from '../../DashboardSettings/components/DisabledReason';

const READ_ONLY_REASON = 'This dashboard is read-only';

interface JsonEditorToolbarProps {
	isDirty: boolean;
	/** Locked/no-permission — Format and Reset (draft mutators) are disabled. */
	readOnly?: boolean;
	onFormat: () => void;
	onCopy: () => void;
	onDownload: () => void;
	onReset: () => void;
}

function JsonEditorToolbar({
	isDirty,
	readOnly = false,
	onFormat,
	onCopy,
	onDownload,
	onReset,
}: JsonEditorToolbarProps): JSX.Element {
	let resetReason: string | undefined;
	if (readOnly) {
		resetReason = READ_ONLY_REASON;
	} else if (!isDirty) {
		resetReason = 'No changes to reset';
	}

	return (
		<div className="tw:flex tw:flex-none tw:flex-wrap tw:items-center tw:gap-1.5 tw:border-b tw:border-border tw:px-6 tw:pt-1 tw:pb-3">
			<DisabledReason reason={readOnly ? READ_ONLY_REASON : undefined}>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={BUTTON_OUTLINE}
					data-testid="json-editor-format"
					disabled={readOnly}
					onClick={onFormat}
				>
					<AlignLeft aria-hidden="true" />
					Format
				</Button>
			</DisabledReason>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={BUTTON_OUTLINE}
				data-testid="json-editor-copy"
				onClick={onCopy}
			>
				<Copy aria-hidden="true" />
				Copy
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={BUTTON_OUTLINE}
				data-testid="json-editor-download"
				onClick={onDownload}
			>
				<Download aria-hidden="true" />
				Download
			</Button>
			<span className="tw:flex-1" />
			<DisabledReason reason={resetReason}>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={BUTTON_GHOST}
					data-testid="json-editor-reset"
					disabled={!!resetReason}
					onClick={onReset}
				>
					<RotateCcw aria-hidden="true" />
					Reset
				</Button>
			</DisabledReason>
		</div>
	);
}

export default JsonEditorToolbar;
