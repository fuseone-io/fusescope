import { useState } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import {
	cliSnippet,
	curlSnippet,
	npmScriptSnippet,
	UploadTarget,
} from 'lib/rum/sourceMapCommands';

import SnippetBlock from '../SnippetBlock';

type Method = 'cli' | 'npm' | 'api';

const METHODS = [
	{ value: 'cli' as const, label: 'CLI', testId: 'rum-sourcemaps-method-cli' },
	{
		value: 'npm' as const,
		label: 'npm script',
		testId: 'rum-sourcemaps-method-npm',
	},
	{ value: 'api' as const, label: 'API', testId: 'rum-sourcemaps-method-api' },
];

const HINT = 'tw:text-xs tw:text-subtle-foreground';
const MONO = 'tw:font-mono';

interface UploadInstructionsProps {
	target: UploadTarget;
}

function UploadInstructions({ target }: UploadInstructionsProps): JSX.Element {
	const [method, setMethod] = useState<Method>('cli');
	return (
		<div className="tw:flex tw:flex-col tw:gap-2">
			<SegmentedControl<Method>
				label="Upload method"
				options={METHODS}
				value={method}
				onChange={setMethod}
				className="tw:self-start"
			/>
			{method === 'cli' && (
				<>
					<SnippetBlock
						code={cliSnippet(target)}
						label="Copy commands"
						testId="rum-sourcemaps-cli"
					/>
					<span className={HINT}>
						Build with hidden source maps (Vite{' '}
						<span className={MONO}>{"build.sourcemap: 'hidden'"}</span>, webpack{' '}
						<span className={MONO}>{"devtool: 'hidden-source-map'"}</span>), so
						bundles carry no <span className={MONO}>sourceMappingURL</span>. Bundles
						served from a sub-path or CDN need{' '}
						<span className={MONO}>--url-prefix</span>; add{' '}
						<span className={MONO}>--delete-after</span> to keep maps out of the
						deploy.
					</span>
				</>
			)}
			{method === 'npm' && (
				<>
					<span className={HINT}>
						In <span className={MONO}>package.json</span>, so the upload runs after
						each build with the version you ship:
					</span>
					<SnippetBlock
						code={npmScriptSnippet()}
						label="Copy package.json snippet"
						testId="rum-sourcemaps-npm"
					/>
					<span className={HINT}>
						Pass the same value to the SDK:{' '}
						<span className={MONO}>
							init({'{'} version {'}'})
						</span>
						.
					</span>
				</>
			)}
			{method === 'api' && (
				<>
					<span className={HINT}>
						One multipart request per release; each <span className={MONO}>file</span>{' '}
						part is named by its map’s URL path. Uploading a path again replaces it.
					</span>
					<SnippetBlock
						code={curlSnippet(target)}
						label="Copy curl command"
						testId="rum-sourcemaps-api"
					/>
					<span className={HINT}>
						<span className={MONO}>GET …/sourcemaps?release=</span> lists files,{' '}
						<span className={MONO}>DELETE …/sourcemaps?release=</span> removes a
						release. Application ID:{' '}
						<span className={MONO}>{target.applicationId}</span>
					</span>
				</>
			)}
			<span className={HINT}>
				<span className={MONO}>--release</span> must equal the{' '}
				<span className={MONO}>version</span> in{' '}
				<span className={MONO}>init()</span>, sent as{' '}
				<span className={MONO}>service.version</span>.
			</span>
		</div>
	);
}

export default UploadInstructions;
