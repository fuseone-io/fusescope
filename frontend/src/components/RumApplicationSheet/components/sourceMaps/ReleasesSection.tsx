import type { RumtypesGettableSourceMapsDTO } from 'api/generated/services/fuseScope.schemas';
import { cn } from 'lib/utils';

import { SourceMapActions } from '../../hooks/useSourceMapActions';
import { formatBytes, latestRelease } from '../../utils/sourceMaps';
import SectionHeading from '../SectionHeading';
import { RELEASE_GRID } from './constants';
import ReleaseRow from './ReleaseRow';

interface ReleasesSectionProps {
	applicationId: string;
	android?: boolean;
	data?: RumtypesGettableSourceMapsDTO;
	loading: boolean;
	readOnly: boolean;
	actions: SourceMapActions;
}

const HEAD =
	'tw:min-h-8 tw:bg-surface-sunken tw:px-3.5 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase';

function ReleasesSection({
	applicationId,
	android = false,
	data,
	loading,
	readOnly,
	actions,
}: ReleasesSectionProps): JSX.Element {
	const releases = data?.releases ?? [];
	const latest = latestRelease(releases);
	return (
		<section
			aria-labelledby="rum-sourcemaps-releases"
			className="tw:flex tw:flex-col tw:gap-2.5"
		>
			<div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-2">
				<SectionHeading id="rum-sourcemaps-releases">
					Uploaded releases
				</SectionHeading>
				{data && releases.length > 0 && (
					<span
						data-testid="rum-sourcemaps-summary"
						className="tw:text-xs tw:text-subtle-foreground tw:tabular-nums"
					>
						{`${releases.length} ${releases.length === 1 ? 'release' : 'releases'} · ${formatBytes(data.sizeBytes)}`}
					</span>
				)}
			</div>
			<div className="tw:overflow-hidden tw:rounded-lg tw:border tw:border-border">
				<div className="tw:overflow-x-auto">
					<div className="tw:min-w-[640px]">
						<div className={cn(RELEASE_GRID, HEAD, 'tw:border-b tw:border-border')}>
							<span />
							<span>Release</span>
							<span className="tw:text-right">Files</span>
							<span className="tw:text-right">Size</span>
							<span>Uploaded</span>
							<span>Last used</span>
							<span />
						</div>
						<ul className="tw:m-0 tw:p-0 tw:[&>li:last-child>div:first-child]:border-b-0">
							{releases.map((release) => (
								<ReleaseRow
									android={android}
									key={release.release}
									applicationId={applicationId}
									release={release}
									latest={release.release === latest}
									readOnly={readOnly}
									onDeleteRelease={actions.deleteRelease}
									onDeleteFile={actions.deleteFile}
								/>
							))}
						</ul>
						{loading && (
							<p className="tw:m-0 tw:px-3.5 tw:py-6 tw:text-center tw:text-[13px] tw:text-muted-foreground">
								{android ? 'Loading R8 mappings…' : 'Loading source maps…'}
							</p>
						)}
						{!loading && releases.length === 0 && (
							<p
								data-testid="rum-sourcemaps-empty"
								className="tw:m-0 tw:px-3.5 tw:py-6 tw:text-center tw:text-[13px] tw:text-muted-foreground"
							>
								{android
									? 'No R8 mappings uploaded yet: stack traces show obfuscated code.'
									: 'No source maps uploaded yet: stack traces show minified code.'}
							</p>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

export default ReleasesSection;
