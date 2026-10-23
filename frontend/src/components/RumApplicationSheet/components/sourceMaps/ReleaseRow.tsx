import { useState } from 'react';
import type { RumtypesSourceMapReleaseDTO } from 'api/generated/services/fuseScope.schemas';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { Button } from 'components/ui/button';
import dayjs from 'dayjs';
import { apiErrorMessage } from 'lib/rum/apiError';
import { formatAgo } from 'lib/rum/format';
import { cn } from 'lib/utils';
import { ChevronRight, Trash2 } from 'lucide-react';

import {
	EXPIRY_WARNING_DAYS,
	expiresInDays,
	formatBytes,
} from '../../utils/sourceMaps';
import ReleaseFiles from './ReleaseFiles';
import { RELEASE_GRID } from './constants';

interface ReleaseRowProps {
	applicationId: string;
	release: RumtypesSourceMapReleaseDTO;
	latest: boolean;
	readOnly: boolean;
	onDeleteRelease: (release: string) => Promise<void>;
	onDeleteFile: (fileId: string) => Promise<void>;
}

const at = (value: string | null): number | undefined =>
	value ? Date.parse(value) : undefined;

function ReleaseRow({
	applicationId,
	release,
	latest,
	readOnly,
	onDeleteRelease,
	onDeleteFile,
}: ReleaseRowProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();
	const days = expiresInDays(release.expiresAt);
	const name = release.release;

	const remove = async (): Promise<void> => {
		setBusy(true);
		try {
			await onDeleteRelease(name);
		} catch (error) {
			setFailure(apiErrorMessage(error));
			setBusy(false);
		}
	};

	return (
		<li data-testid="rum-sourcemaps-release" className="tw:list-none">
			<div
				className={cn(
					RELEASE_GRID,
					'tw:min-h-[52px] tw:border-b tw:border-border tw:px-3.5',
				)}
			>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-expanded={open}
					aria-label={`Show files of ${name}`}
					data-testid="rum-sourcemaps-expand"
					onClick={(): void => setOpen((current) => !current)}
				>
					<ChevronRight
						className={cn('tw:transition-transform', open && 'tw:rotate-90')}
					/>
				</Button>
				<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-tight">
					<span className="tw:truncate tw:font-mono tw:text-xs tw:font-semibold">
						{name}
					</span>
					{latest && (
						<span className="tw:text-[11px] tw:text-success-ink">latest</span>
					)}
				</span>
				<span className="tw:text-right tw:tabular-nums">{release.files}</span>
				<span className="tw:text-right tw:text-muted-foreground tw:tabular-nums">
					{formatBytes(release.sizeBytes)}
				</span>
				<span className="tw:flex tw:min-w-0 tw:flex-col tw:leading-tight">
					<span className="tw:text-xs tw:tabular-nums">
						{dayjs(release.uploadedAt).format('MMM D, HH:mm')}
					</span>
					<span
						title={release.uploadedBy}
						className="tw:truncate tw:text-[11px] tw:text-subtle-foreground"
					>
						{release.uploadedBy}
					</span>
				</span>
				<span className="tw:flex tw:min-w-0 tw:flex-col tw:items-start tw:gap-0.5 tw:leading-tight">
					<span className="tw:text-xs tw:text-muted-foreground tw:tabular-nums">
						{release.lastUsedAt
							? `last used ${formatAgo(at(release.lastUsedAt))}`
							: 'not used yet'}
					</span>
					{days !== undefined && days <= EXPIRY_WARNING_DAYS && (
						<StatusBadge tone="warning" testId="rum-sourcemaps-expiring">
							{days === 0
								? 'Deleted today'
								: `Deleted in ${days} ${days === 1 ? 'day' : 'days'}`}
						</StatusBadge>
					)}
				</span>
				{readOnly ? (
					<span />
				) : (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Delete source maps of ${name}`}
						data-testid="rum-sourcemaps-release-delete"
						onClick={(): void => setConfirming(true)}
						className="tw:text-error-ink"
					>
						<Trash2 />
					</Button>
				)}
			</div>
			{confirming && (
				<div
					role="alertdialog"
					aria-label={`Delete source maps of ${name}`}
					data-testid="rum-sourcemaps-confirm"
					className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-3 tw:gap-y-2 tw:border-b tw:border-border tw:bg-error-soft tw:px-3.5 tw:py-2.5 tw:text-xs tw:text-error-ink"
				>
					<span>
						{failure ?? (
							<>
								Delete {release.files} files of{' '}
								<span className="tw:font-mono">{name}</span>? Its stack traces become
								minified again. Events are kept.
							</>
						)}
					</span>
					<span className="tw:flex tw:gap-1.5">
						<Button
							variant="ghost"
							size="sm"
							onClick={(): void => {
								setConfirming(false);
								setFailure(undefined);
							}}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={busy}
							data-testid="rum-sourcemaps-confirm-delete"
							onClick={remove}
						>
							Delete {name}
						</Button>
					</span>
				</div>
			)}
			{open && (
				<ReleaseFiles
					applicationId={applicationId}
					release={name}
					readOnly={readOnly}
					onDeleteFile={onDeleteFile}
				/>
			)}
		</li>
	);
}

export default ReleaseRow;
