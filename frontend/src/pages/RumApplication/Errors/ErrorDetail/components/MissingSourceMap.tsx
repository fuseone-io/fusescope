import CopyButton from 'components/RumApplicationSheet/components/CopyButton';
import { appUploadCommand } from 'lib/rum/sourceMapCommands';
import { sdkEndpoint } from 'components/RumApplicationSheet/utils/endpoint';
import { TriangleAlert } from 'lucide-react';

interface MissingSourceMapProps {
	applicationId: string;
	release: string;
	/** The bundle the top frame points at. */
	file: string;
	onOpenSourceMaps: () => void;
}

function MissingSourceMap({
	applicationId,
	release,
	file,
	onOpenSourceMaps,
}: MissingSourceMapProps): JSX.Element {
	const command = appUploadCommand({
		url: sdkEndpoint(),
		applicationId,
		release,
	});
	return (
		<div
			aria-live="polite"
			data-testid="rum-error-missing-map"
			className="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:bg-warning-soft tw:px-3.5 tw:py-3 tw:text-warning-ink"
		>
			<span className="tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:font-semibold">
				<TriangleAlert aria-hidden="true" className="tw:size-4 tw:flex-none" />
				Source map missing for release {release}
			</span>
			<span className="tw:text-xs">
				{file ? (
					<>
						No uploaded map matches <span className="tw:font-mono">{file}</span>.{' '}
					</>
				) : null}
				<span className="translate-safe">
					Upload the maps from this release’s build; past events are symbolicated
					too, since this runs when you read them.
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
					Source maps settings
				</button>{' '}
				· export an Editor service account key as{' '}
				<span className="tw:font-mono">FUSESCOPE_API_KEY</span>; the release must
				equal <span className="tw:font-mono">version</span> in{' '}
				<span className="tw:font-mono">init()</span>
			</span>
		</div>
	);
}

export default MissingSourceMap;
