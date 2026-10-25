import type { RumtypesMissingSourceMapDTO } from 'api/generated/services/fuseScope.schemas';
import { RumtypesArtifactKindDTO } from 'api/generated/services/fuseScope.schemas';
import CopyButton from 'components/RumApplicationSheet/components/CopyButton';
import { sdkEndpoint } from 'components/RumApplicationSheet/utils/endpoint';
import { mappingUploadCommand } from 'lib/rum/androidSetup';
import { appUploadCommand } from 'lib/rum/sourceMapCommands';
import { TriangleAlert } from 'lucide-react';

interface MissingSourceMapProps {
	applicationId: string;
	missing: NonNullable<RumtypesMissingSourceMapDTO>;
	/** The bundle the top frame points at; empty for a JVM trace. */
	file: string;
	onOpenSourceMaps: () => void;
}

const MONO = 'tw:font-mono';

function MissingSourceMap({
	applicationId,
	missing,
	file,
	onOpenSourceMaps,
}: MissingSourceMapProps): JSX.Element {
	const { release } = missing;
	const r8 = missing.kind === RumtypesArtifactKindDTO['r8-mapping'];
	const target = { url: sdkEndpoint(), applicationId, release };
	const command = r8 ? mappingUploadCommand(target) : appUploadCommand(target);
	return (
		<div
			aria-live="polite"
			data-testid="rum-error-missing-map"
			className="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:bg-warning-soft tw:px-3.5 tw:py-3 tw:text-warning-ink"
		>
			<span className="tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:font-semibold">
				<TriangleAlert aria-hidden="true" className="tw:size-4 tw:flex-none" />
				<span className="translate-safe">
					{`${r8 ? 'R8 mapping' : 'Source map'} missing for release ${release}`}
				</span>
			</span>
			<span className="tw:text-xs">
				{file ? (
					<>
						No uploaded map matches <span className={MONO}>{file}</span>.{' '}
					</>
				) : null}
				<span className="translate-safe">
					{r8
						? 'Upload the mapping.txt of this release’s minified build; past events are retraced too, since this runs when you read them.'
						: 'Upload the maps from this release’s build; past events are symbolicated too, since this runs when you read them.'}
				</span>
			</span>
			<div className="tw:flex tw:items-start tw:gap-2 tw:rounded-md tw:border tw:border-border tw:bg-surface-raised tw:py-1 tw:pr-1 tw:pl-3 tw:text-foreground">
				<code
					data-testid="rum-error-upload-command"
					className="tw:min-w-0 tw:flex-1 tw:overflow-x-auto tw:py-1 tw:font-mono tw:text-xs tw:leading-relaxed tw:whitespace-pre"
				>
					{command}
				</code>
				<CopyButton value={command} label="Copy upload command" iconOnly />
			</div>
			<span className="tw:text-xs">
				<button
					type="button"
					onClick={onOpenSourceMaps}
					data-testid="rum-error-open-sourcemaps"
					className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:text-inherit tw:underline tw:underline-offset-2"
				>
					{r8 ? 'R8 mappings settings' : 'Source maps settings'}
				</button>{' '}
				· export an Editor service account key as{' '}
				<span className={MONO}>FUSESCOPE_API_KEY</span>; the release must equal{' '}
				{r8 ? (
					<>
						the app’s <span className={MONO}>versionName</span>
					</>
				) : (
					<>
						<span className={MONO}>version</span> in{' '}
						<span className={MONO}>init()</span>
					</>
				)}
			</span>
		</div>
	);
}

export default MissingSourceMap;
