import { useState } from 'react';
import MEditor, { Monaco } from '@monaco-editor/react';
import { Color } from '@signozhq/design-tokens';
import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Maximize2 } from 'lucide-react';
import { useIsDarkMode } from 'hooks/useDarkMode';

import styles from './NewDashboardModal.module.scss';

interface Props {
	value: string;
	onChange?: (value: string) => void;
	readOnly?: boolean;
	height?: string;
}

const defineTheme = (monaco: Monaco): void => {
	monaco.editor.defineTheme('my-theme', {
		base: 'vs-dark',
		inherit: true,
		rules: [
			{ token: 'string.key.json', foreground: Color.BG_VANILLA_400 },
			{ token: 'string.value.json', foreground: Color.BG_ROBIN_400 },
		],
		colors: { 'editor.background': Color.BG_INK_300 },
	});
};

// JSON editor with a one-click "expand" into an extra-wide modal for easier
// editing/review. The expanded editor shares the same value, so edits persist.
function JsonEditor({
	value,
	onChange,
	readOnly = false,
	height = '38vh',
}: Props): JSX.Element {
	const isDarkMode = useIsDarkMode();
	const [expanded, setExpanded] = useState(false);

	const renderEditor = (editorHeight: string): JSX.Element => (
		<MEditor
			language="json"
			height={editorHeight}
			value={value}
			onChange={(next): void => onChange?.(next || '')}
			options={{
				readOnly,
				scrollbar: { alwaysConsumeMouseWheel: false },
				minimap: { enabled: false },
				fontSize: 13,
				fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
			}}
			theme={isDarkMode ? 'my-theme' : 'light'}
			beforeMount={defineTheme}
		/>
	);

	return (
		<div className={styles.editorWrap}>
			<div className={`fs-ui ${styles.expandBtn}`}>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Expand editor"
					data-testid="json-editor-expand"
					onClick={(): void => setExpanded(true)}
				>
					<Maximize2 />
				</Button>
			</div>
			<div className={styles.editor}>{renderEditor(height)}</div>

			<Dialog
				open={expanded}
				onOpenChange={(next): void => {
					if (!next) {
						setExpanded(false);
					}
				}}
			>
				<DialogContent
					aria-describedby={undefined}
					className="tw:max-w-[min(1200px,calc(100%-2rem))]"
				>
					<DialogHeader>
						<DialogTitle>{readOnly ? 'Preview JSON' : 'Edit JSON'}</DialogTitle>
					</DialogHeader>
					<div className={`${styles.editor} ${styles.editorExpanded}`}>
						{renderEditor('70vh')}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default JsonEditor;
