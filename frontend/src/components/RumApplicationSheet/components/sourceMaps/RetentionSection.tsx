import { useState } from 'react';
import type {
	RumtypesGettableSourceMapsDTO,
	RumtypesSourceMapRetentionDTO,
	RumtypesSourceMapSettingsDTO,
} from 'api/generated/services/fuseScope.schemas';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { Button } from 'components/ui/button';
import { Switch } from 'components/ui/switch';
import { toast } from '@signozhq/ui/sonner';
import { apiErrorMessage } from 'lib/rum/apiError';

import { formatBytes, RETENTION_OPTIONS } from '../../utils/sourceMaps';
import SectionHeading from '../SectionHeading';

interface RetentionSectionProps {
	settings: RumtypesSourceMapSettingsDTO;
	data?: RumtypesGettableSourceMapsDTO;
	readOnly: boolean;
	saving: boolean;
	onSave: (settings: RumtypesSourceMapSettingsDTO) => Promise<void>;
}

const HINT = 'tw:text-xs tw:text-subtle-foreground';

function RetentionSection({
	settings,
	data,
	readOnly,
	saving,
	onSave,
}: RetentionSectionProps): JSX.Element {
	const [draft, setDraft] = useState(settings);
	const [failure, setFailure] = useState<string>();
	const dirty =
		draft.retention !== settings.retention ||
		draft.keepNewestReleases !== settings.keepNewestReleases;
	const quota = data?.limits.quota ?? 0;
	const used = data?.sizeBytes ?? 0;
	const percent =
		quota > 0 ? Math.max(1, Math.min(100, (used / quota) * 100)) : 0;

	const save = async (): Promise<void> => {
		try {
			setFailure(undefined);
			await onSave(draft);
			toast.success('Source map retention saved');
		} catch (error) {
			setFailure(apiErrorMessage(error));
		}
	};

	return (
		<section
			aria-labelledby="rum-sourcemaps-retention"
			className="tw:flex tw:flex-col tw:gap-3"
		>
			<div>
				<SectionHeading id="rum-sourcemaps-retention">Retention</SectionHeading>
				<p className="tw:m-0 tw:mt-0.5 tw:text-xs tw:text-muted-foreground">
					Old maps are deleted automatically. Deleting a release never deletes its
					events.
				</p>
			</div>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
				<span className="tw:text-[13px] tw:font-medium">
					Delete maps not used for
				</span>
				<SegmentedControl<RumtypesSourceMapRetentionDTO>
					label="Retention"
					options={RETENTION_OPTIONS.map((option) => ({
						...option,
						testId: `rum-sourcemaps-retention-${option.value}`,
					}))}
					value={draft.retention}
					disabled={readOnly}
					onChange={(retention): void =>
						setDraft((current) => ({ ...current, retention }))
					}
				/>
			</div>
			<div className="tw:flex tw:items-start tw:gap-3">
				<Switch
					id="rum-sourcemaps-keep"
					data-testid="rum-sourcemaps-keep"
					checked={draft.keepNewestReleases}
					disabled={readOnly}
					onCheckedChange={(keepNewestReleases): void =>
						setDraft((current) => ({ ...current, keepNewestReleases }))
					}
				/>
				<label htmlFor="rum-sourcemaps-keep" className="tw:flex tw:flex-col">
					<span className="tw:text-[13px] tw:font-medium">
						Always keep the 3 newest releases
					</span>
					<span className={HINT}>Even when they have not been used</span>
				</label>
			</div>
			{data && (
				<div className="tw:flex tw:flex-col tw:gap-1.5 tw:rounded-lg tw:bg-surface-sunken tw:px-3.5 tw:py-3">
					<span className="tw:flex tw:justify-between tw:gap-2 tw:text-xs">
						<span>Storage</span>
						<span
							data-testid="rum-sourcemaps-storage"
							className="tw:text-muted-foreground tw:tabular-nums"
						>
							{formatBytes(used)} of {formatBytes(quota)}
						</span>
					</span>
					<span
						aria-hidden="true"
						className="tw:block tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-border"
					>
						<span
							className="tw:block tw:h-full tw:rounded-full tw:bg-primary"
							style={{ width: `${percent}%` }}
						/>
					</span>
					<span className={HINT}>
						Up to {formatBytes(data.limits.maxFileSize)} per file and{' '}
						{data.limits.maxFilesPerRelease.toLocaleString('en-US')} files per release
					</span>
				</div>
			)}
			{!readOnly && (
				<div className="tw:flex tw:items-center tw:gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!dirty || saving}
						data-testid="rum-sourcemaps-retention-save"
						onClick={save}
					>
						Save retention
					</Button>
					{failure && (
						<span role="alert" className="tw:text-xs tw:text-error">
							{failure}
						</span>
					)}
				</div>
			)}
		</section>
	);
}

export default RetentionSection;
