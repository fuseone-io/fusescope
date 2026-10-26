import { useMemo } from 'react';
import type {
	RumtypesApplicationDTO,
	RumtypesGettableApplicationStatusDTO,
} from 'api/generated/services/fuseScope.schemas';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import SoonBadge from 'components/Rum/SoonBadge';
import { Button } from 'components/ui/button';
import { ArrowLeft } from 'lucide-react';

import { RevealedKey } from '../hooks/useApplicationSheet';
import {
	NPM_INSTALL_COMMAND,
	SDK_PACKAGE,
	buildNpmSnippet,
} from '../utils/snippet';
import { sdkEndpoint } from '../utils/endpoint';
import AndroidInstall from './AndroidInstall';
import KeyOnceBanner from './KeyOnceBanner';
import SectionHeading from './SectionHeading';
import SetupStatus from './SetupStatus';
import SheetFooter from './SheetFooter';
import SnippetBlock from './SnippetBlock';

interface InstallTabProps {
	application: RumtypesApplicationDTO;
	/** The key for the snippet: plaintext while known, else a placeholder. */
	publicKey: string;
	revealed?: RevealedKey;
	status?: RumtypesGettableApplicationStatusDTO;
	onAddOrigin?: (origin: string) => void;
	onBack: () => void;
	onDone: () => void;
}

type Method = 'npm' | 'cdn' | 'self';

const METHODS = [
	{ value: 'npm' as const, label: 'npm' },
	{ value: 'cdn' as const, label: 'Script tag · CDN' },
	{ value: 'self' as const, label: 'Script tag · this FuseScope' },
].map((method) =>
	method.value === 'npm'
		? method
		: {
				...method,
				disabled: true,
				title: `${method.label} is coming soon`,
				badge: <SoonBadge />,
			},
);

const SDK_ATTRIBUTES_URL =
	'https://github.com/fuseone-io/fusescope-sdk/tree/main/packages/browser#data';

function InstallTab({
	application,
	publicKey,
	revealed,
	status,
	onAddOrigin,
	onBack,
	onDone,
}: InstallTabProps): JSX.Element {
	const snippet = useMemo(
		() =>
			buildNpmSnippet({
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
		<div
			className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col"
			data-testid="rum-app-install"
		>
			<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6">
				{revealed && (
					<KeyOnceBanner
						applicationKey={revealed.key}
						applicationName={application.name}
					/>
				)}
				{application.platform === RumtypesPlatformDTO.android ? (
					<AndroidInstall
						application={application}
						publicKey={publicKey}
						keyKnown={Boolean(revealed)}
					/>
				) : (
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
							value="npm"
							onChange={(): void => undefined}
							className="tw:self-start"
						/>
						<SnippetBlock
							code={`$ ${NPM_INSTALL_COMMAND}`}
							label="Copy install command"
							testId="rum-install-command"
						/>
						<span className="tw:text-xs tw:text-subtle-foreground">
							Then, as early as possible in your app entry point:
						</span>
						<SnippetBlock
							code={snippet}
							label="Copy snippet"
							testId="rum-install-snippet"
						/>
						{!revealed && (
							<span className="tw:text-xs tw:text-subtle-foreground">
								Keys are stored hashed: replace{' '}
								<span className="tw:font-mono">{publicKey}</span> with your key, or
								rotate it to get a new one.
							</span>
						)}
						<span className="tw:text-xs tw:text-subtle-foreground">
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
				)}
				<SetupStatus
					applicationId={application.id}
					applicationName={application.name}
					firstOrigin={application.allowedOrigins?.find((origin) => origin !== '*')}
					status={status}
					onAddOrigin={onAddOrigin}
				/>
			</div>
			<SheetFooter
				status={
					<Button variant="ghost" size="sm" onClick={onBack}>
						<ArrowLeft />
						Settings
					</Button>
				}
			>
				<Button
					variant="outline"
					size="sm"
					onClick={onDone}
					data-testid="rum-install-done"
				>
					Done
				</Button>
			</SheetFooter>
		</div>
	);
}

export default InstallTab;
