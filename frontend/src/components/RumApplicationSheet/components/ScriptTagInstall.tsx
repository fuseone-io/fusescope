import { useMemo, useState } from 'react';
import type { RumtypesBundledSDKDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';

import { ScriptSource, SnippetInput } from '../types';
import {
	SCRIPT_SOURCES,
	buildScriptSnippet,
	scriptSource,
} from '../utils/snippet';
import SnippetBlock from './SnippetBlock';

interface ScriptTagInstallProps {
	input: SnippetInput;
	/** The bundle this server serves; unknown until the status loads. */
	bundle?: RumtypesBundledSDKDTO;
}

const HINT = 'tw:text-xs tw:text-subtle-foreground';

const SOURCE_OPTIONS = SCRIPT_SOURCES.map((source) => ({
	...source,
	testId: `rum-install-source-${source.value}`,
}));

function ScriptTagInstall({
	input,
	bundle,
}: ScriptTagInstallProps): JSX.Element {
	const [source, setSource] = useState<ScriptSource>('self');
	const snippet = useMemo(
		() =>
			bundle &&
			buildScriptSnippet(
				input,
				scriptSource(source, bundle, input.endpoint),
				bundle.integrity,
			),
		[input, bundle, source],
	);

	return (
		<>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<span className={HINT}>Load from</span>
				<SegmentedControl<ScriptSource>
					label="Bundle source"
					options={SOURCE_OPTIONS}
					value={source}
					onChange={setSource}
					size="sm"
				/>
			</div>
			<span className={HINT}>
				In the page&apos;s <span className="tw:font-mono">&lt;head&gt;</span>,
				before your own scripts:
			</span>
			{snippet ? (
				<SnippetBlock
					code={snippet}
					label="Copy script tag"
					testId="rum-install-script"
				/>
			) : (
				<span className={HINT} data-testid="rum-install-script-loading">
					Loading the bundle version…
				</span>
			)}
			<span className={HINT} data-testid="rum-install-origins-note">
				The page&apos;s origin must be in this application&apos;s allowed origins.
				{bundle && (
					<>
						{' '}
						Every source serves the same{' '}
						<span className="tw:font-mono">
							{bundle.name}@{bundle.version}
						</span>
						, so the integrity matches.
					</>
				)}
			</span>
		</>
	);
}

export default ScriptTagInstall;
