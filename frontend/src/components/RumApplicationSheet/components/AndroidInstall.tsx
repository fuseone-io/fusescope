import { useMemo } from 'react';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import {
	ANDROID_SDK_ARTIFACT,
	buildAndroidInitSnippet,
	gradleDependencySnippet,
	mappingGradleSnippet,
} from 'lib/rum/androidSetup';

import { sdkEndpoint } from '../utils/endpoint';
import SectionHeading from './SectionHeading';
import SnippetBlock from './SnippetBlock';

interface AndroidInstallProps {
	application: RumtypesApplicationDTO;
	/** The key for the snippet: plaintext while known, else a placeholder. */
	publicKey: string;
	keyKnown: boolean;
}

const HINT = 'tw:text-xs tw:text-subtle-foreground';
const MONO = 'tw:font-mono';

/** Gradle setup, the init call and the mapping upload of an Android application. */
function AndroidInstall({
	application,
	publicKey,
	keyKnown,
}: AndroidInstallProps): JSX.Element {
	const endpoint = sdkEndpoint();
	const init = useMemo(
		() =>
			buildAndroidInitSnippet({
				applicationId: application.id,
				name: application.name,
				environment: application.environment,
				publicKey,
				endpoint,
				sampleRate: application.sampleRate,
				piiPolicy: application.piiPolicy,
			}),
		[application, publicKey, endpoint],
	);
	const mapping = mappingGradleSnippet({
		url: endpoint,
		applicationId: application.id,
		release: '',
	});

	return (
		<section
			aria-labelledby="rum-install"
			className="tw:flex tw:flex-col tw:gap-3"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<SectionHeading id="rum-install">Install the SDK</SectionHeading>
				<span className="tw:font-mono tw:text-xs tw:text-subtle-foreground">
					{ANDROID_SDK_ARTIFACT}
				</span>
			</div>
			<span className={HINT}>
				In <span className={MONO}>app/build.gradle.kts</span>, from Maven Central:
			</span>
			<SnippetBlock
				code={gradleDependencySnippet()}
				label="Copy Gradle setup"
				testId="rum-install-gradle"
			/>
			<span className={HINT}>
				Then start it in <span className={MONO}>Application.onCreate</span>:
			</span>
			<SnippetBlock
				code={init}
				label="Copy snippet"
				testId="rum-install-snippet"
			/>
			{!keyKnown && (
				<span className={HINT}>
					Keys are stored hashed: replace <span className={MONO}>{publicKey}</span>{' '}
					with your key, or rotate it to get a new one.
				</span>
			)}
			<span className={HINT}>
				Crashes, ANRs, app start and screens are on by default. The app’s
				applicationId must be in the allowed package names.
			</span>
			<SectionHeading id="rum-install-mapping-heading">
				Upload R8 mappings
			</SectionHeading>
			<span className={HINT}>
				The plugin uploads <span className={MONO}>mapping.txt</span> after each
				minified build, for the <span className={MONO}>versionName</span> the SDK
				reports as <span className={MONO}>service.version</span>. Export an Editor
				service account key as <span className={MONO}>FUSESCOPE_API_KEY</span>.
			</span>
			<SnippetBlock
				code={mapping}
				label="Copy plugin settings"
				testId="rum-install-mapping"
			/>
		</section>
	);
}

export default AndroidInstall;
