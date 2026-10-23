import { useListRUMSourceMaps } from 'api/generated/services/rum';
import { Button } from 'components/ui/button';
import { Trash2 } from 'lucide-react';

import { formatBytes } from '../../utils/sourceMaps';

interface ReleaseFilesProps {
	applicationId: string;
	release: string;
	readOnly: boolean;
	onDeleteFile: (fileId: string) => Promise<void>;
}

const GRID =
	'tw:grid tw:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_32px] tw:items-center tw:gap-3';

/** The maps of one release, loaded when it is expanded. */
function ReleaseFiles({
	applicationId,
	release,
	readOnly,
	onDeleteFile,
}: ReleaseFilesProps): JSX.Element {
	const query = useListRUMSourceMaps({ id: applicationId }, { release });
	const files = query.data?.data.files ?? [];
	return (
		<div
			data-testid="rum-sourcemaps-files"
			className="tw:flex tw:flex-col tw:gap-0.5 tw:border-b tw:border-border tw:bg-surface-sunken tw:py-2 tw:pr-3.5 tw:pl-12"
		>
			<div
				className={`${GRID} tw:min-h-7 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase`}
			>
				<span>Map file</span>
				<span>Matches bundle URL</span>
				<span className="tw:text-right">Size</span>
				<span />
			</div>
			{query.isLoading && (
				<span className="tw:py-1 tw:text-xs tw:text-muted-foreground">
					Loading files…
				</span>
			)}
			{files.map((file) => (
				<div
					key={file.id}
					data-testid="rum-sourcemaps-file"
					className={`${GRID} tw:min-h-[30px] tw:text-xs`}
				>
					<span title={file.path} className="tw:truncate tw:font-mono">
						{file.path}
					</span>
					<span
						title={file.debugId ? `debug ID ${file.debugId}` : file.generatedPath}
						className="tw:truncate tw:font-mono tw:text-muted-foreground"
					>
						{file.generatedPath}
					</span>
					<span className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
						{formatBytes(file.sizeBytes)}
					</span>
					{readOnly ? (
						<span />
					) : (
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={`Delete ${file.path}`}
							data-testid="rum-sourcemaps-file-delete"
							onClick={(): Promise<void> => onDeleteFile(file.id)}
						>
							<Trash2 />
						</Button>
					)}
				</div>
			))}
			<span className="tw:pt-1 tw:text-[11px] tw:text-subtle-foreground">
				Matched by the bundle’s URL path; serving under a prefix still matches.
			</span>
		</div>
	);
}

export default ReleaseFiles;
