import { useState } from 'react';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import {
	ANDROID_PLUGIN_ID,
	MAPPING_FILE,
	mappingCurlSnippet,
	mappingGradleSnippet,
} from 'lib/rum/androidSetup';
import { UploadTarget } from 'lib/rum/sourceMapCommands';

import SnippetBlock from '../SnippetBlock';

type Method = 'gradle' | 'api';

const METHODS = [
	{
		value: 'gradle' as const,
		label: 'Gradle plugin',
		testId: 'rum-mappings-method-gradle',
	},
	{ value: 'api' as const, label: 'API', testId: 'rum-mappings-method-api' },
];

const HINT = 'tw:text-xs tw:text-subtle-foreground';
const MONO = 'tw:font-mono';

interface MappingUploadInstructionsProps {
	target: UploadTarget;
}

function MappingUploadInstructions({
	target,
}: MappingUploadInstructionsProps): JSX.Element {
	const [method, setMethod] = useState<Method>('gradle');
	return (
		<div className="tw:flex tw:flex-col tw:gap-2">
			<SegmentedControl<Method>
				label="Upload method"
				options={METHODS}
				value={method}
				onChange={setMethod}
				className="tw:self-start"
			/>
			{method === 'gradle' ? (
				<>
					<span className={HINT}>
						In <span className={MONO}>app/build.gradle.kts</span>, with the{' '}
						<span className={MONO}>{ANDROID_PLUGIN_ID}</span> plugin applied; it
						uploads after each minified build:
					</span>
					<SnippetBlock
						code={mappingGradleSnippet(target)}
						label="Copy plugin settings"
						testId="rum-mappings-gradle"
					/>
				</>
			) : (
				<>
					<span className={HINT}>
						The raw <span className={MONO}>{MAPPING_FILE}</span> as the body, gzip
						allowed. Set R8_MAP_ID to its pg_map_id header, or leave it empty if
						absent. Uploading the same release and map ID replaces that mapping.
					</span>
					<SnippetBlock
						code={mappingCurlSnippet(target)}
						label="Copy curl command"
						testId="rum-mappings-api"
					/>
				</>
			)}
			<span className={HINT}>
				The release must equal the app’s <span className={MONO}>versionName</span>,
				sent as <span className={MONO}>service.version</span>.
			</span>
		</div>
	);
}

export default MappingUploadInstructions;
