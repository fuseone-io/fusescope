import { useListRUMSourceMaps } from 'api/generated/services/rum';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesPlatformDTO,
	RumtypesSourceMapRetentionDTO,
} from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';

import { useSourceMapActions } from '../hooks/useSourceMapActions';
import { sdkEndpoint } from '../utils/endpoint';
import { latestRelease } from '../utils/sourceMaps';
import SectionHeading from './SectionHeading';
import SheetFooter from './SheetFooter';
import DropUpload from './sourceMaps/DropUpload';
import MappingUploadInstructions from './sourceMaps/MappingUploadInstructions';
import ReleasesSection from './sourceMaps/ReleasesSection';
import RetentionSection from './sourceMaps/RetentionSection';
import UploadInstructions from './sourceMaps/UploadInstructions';

interface SourceMapsTabProps {
	application: RumtypesApplicationDTO;
	readOnly: boolean;
	onDone: () => void;
}

const DEFAULT_SETTINGS = {
	retention: RumtypesSourceMapRetentionDTO['90d'],
	keepNewestReleases: true,
};
const EXAMPLE_RELEASE = '1.0.0';

function SourceMapsTab({
	application,
	readOnly,
	onDone,
}: SourceMapsTabProps): JSX.Element {
	const query = useListRUMSourceMaps({ id: application.id });
	const data = query.data?.data;
	const actions = useSourceMapActions(application);
	const release = latestRelease(data?.releases ?? []) ?? EXAMPLE_RELEASE;
	const settings = application.sourceMaps ?? DEFAULT_SETTINGS;
	const android = application.platform === RumtypesPlatformDTO.android;
	const target = { url: sdkEndpoint(), applicationId: application.id, release };

	return (
		<div
			className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col"
			data-testid="rum-app-sourcemaps"
		>
			<div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-6 tw:overflow-y-auto tw:px-6 tw:pt-5 tw:pb-6">
				{android ? (
					<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
						Stack traces are retraced when you read them, with the R8 mapping uploaded
						for the event’s release (
						<span className="tw:font-mono tw:text-foreground">service.version</span>
						). Uploading later fixes past events too. Mappings stay on the server.
					</p>
				) : (
					<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
						Stack traces are symbolicated when you read them, with the maps uploaded
						for the event’s release (
						<span className="tw:font-mono tw:text-foreground">service.version</span>
						). Uploading later fixes past events too. Maps stay on the server and are
						never sent to browsers.
					</p>
				)}
				<ReleasesSection
					applicationId={application.id}
					data={data}
					loading={query.isLoading}
					readOnly={readOnly}
					actions={actions}
				/>
				<section
					aria-labelledby="rum-sourcemaps-upload"
					className="tw:flex tw:flex-col tw:gap-2.5"
				>
					<div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-2">
						<SectionHeading id="rum-sourcemaps-upload">Upload</SectionHeading>
						<span className="tw:text-xs tw:text-subtle-foreground">
							Needs a service account API key with the Editor role, not the public key
						</span>
					</div>
					{android ? (
						<MappingUploadInstructions target={target} />
					) : (
						<UploadInstructions target={target} />
					)}
					{readOnly ? (
						<span
							data-testid="rum-sourcemaps-readonly"
							className="tw:text-xs tw:text-subtle-foreground"
						>
							Viewers can see the uploads; admins and editors upload and delete them.
						</span>
					) : (
						data &&
						!android && (
							<DropUpload
								defaultRelease={data.releases?.length ? release : ''}
								onUpload={actions.upload}
							/>
						)
					)}
				</section>
				<RetentionSection
					key={`${settings.retention}-${settings.keepNewestReleases}`}
					settings={settings}
					data={data}
					readOnly={readOnly}
					saving={actions.savingSettings}
					onSave={actions.saveSettings}
				/>
			</div>
			<SheetFooter>
				<Button
					variant="outline"
					size="sm"
					onClick={onDone}
					data-testid="rum-sourcemaps-done"
				>
					Done
				</Button>
			</SheetFooter>
		</div>
	);
}

export default SourceMapsTab;
