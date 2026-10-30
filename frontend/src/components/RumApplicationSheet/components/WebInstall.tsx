import { useMemo, useState } from 'react';
import type {
	RumtypesApplicationDTO,
	RumtypesBundledSDKDTO,
} from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';

import { SnippetInput } from '../types';
import { sdkEndpoint } from '../utils/endpoint';
import {
	NPM_INSTALL_COMMAND,
	SDK_PACKAGE,
	buildNpmSnippet,
} from '../utils/snippet';
import ScriptTagInstall from './ScriptTagInstall';
import SectionHeading from './SectionHeading';
import SnippetBlock from './SnippetBlock';

interface WebInstallProps {
	application: RumtypesApplicationDTO;
	/** The key for the snippet: plaintext while known, else a placeholder. */
	publicKey: string;
	keyKnown: boolean;
	bundle?: RumtypesBundledSDKDTO;
}

type Method = 'npm' | 'script';

const METHODS = [
	{ value: 'npm' as const, label: 'npm', testId: 'rum-install-method-npm' },
	{
		value: 'script' as const,
		label: 'Script tag',
		testId: 'rum-install-method-script',
	},
];

const HINT = 'tw:text-xs tw:text-subtle-foreground';

const SDK_ATTRIBUTES_URL =
	'https://github.com/fuseone-io/fusescope-sdk/tree/main/packages/browser#data';

/** npm or script-tag setup of a web application. */
function WebInstall({
	application,
	publicKey,
	keyKnown,
	bundle,
}: WebInstallProps): JSX.Element {
	const [method, setMethod] = useState<Method>('npm');
	const input = useMemo<SnippetInput>(
		() => ({
			applicationId: application.id,
			environment: application.environment,
			publicKey,
			endpoint: sdkEndpoint(),
			sampleRate: application.sampleRate,
			tracePropagationUrls: application.tracePropagationUrls ?? [],
			piiPolicy: application.piiPolicy,
		}),
		[application, publicKey],
	);

	return (
		<section
			aria-labelledby="rum-install"
			className="tw:flex tw:flex-col tw:gap-3"
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
				<SectionHeading id="rum-install">Install the SDK</SectionHeading>
				<span className="tw:font-mono tw:text-xs tw:text-subtle-foreground">
					{SDK_PACKAGE}
				</span>
			</div>
			<SegmentedControl<Method>
				label="Install method"
				options={METHODS}
				value={method}
				onChange={setMethod}
				className="tw:self-start"
			/>
			{method === 'npm' ? (
				<>
					<SnippetBlock
						code={`$ ${NPM_INSTALL_COMMAND}`}
						label="Copy install command"
						testId="rum-install-command"
					/>
					<span className={HINT}>
						Then, as early as possible in your app entry point:
					</span>
					<SnippetBlock
						code={buildNpmSnippet(input)}
						label="Copy snippet"
						testId="rum-install-snippet"
					/>
				</>
			) : (
				<ScriptTagInstall input={input} bundle={bundle} />
			)}
			{!keyKnown && (
				<span className={HINT}>
					Keys are stored hashed: replace{' '}
					<span className="tw:font-mono">{publicKey}</span> with your key, or rotate
					it to get a new one.
				</span>
			)}
			<span className={HINT}>
				Already using the OpenTelemetry web SDK? Export OTLP to{' '}
				<span className="tw:font-mono">/rum/v1/traces</span> and{' '}
				<span className="tw:font-mono">/rum/v1/logs</span> with header{' '}
				<span className="tw:font-mono">FuseScope-RUM-Key</span>.{' '}
				<a
					href={SDK_ATTRIBUTES_URL}
					target="_blank"
					rel="noreferrer"
					className="tw:text-primary! tw:underline! tw:underline-offset-2"
				>
					Attributes
				</a>
			</span>
		</section>
	);
}

export default WebInstall;
