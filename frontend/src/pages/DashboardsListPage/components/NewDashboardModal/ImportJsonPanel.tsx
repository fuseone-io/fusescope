import { type ChangeEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath } from 'react-router-dom';
import { Button } from 'components/ui/button';
import { toast } from '@signozhq/ui/sonner';
import { CircleAlert, LoaderCircle, MoveRight, Upload } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { createDashboardV2 } from 'api/generated/services/dashboard';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { useErrorModal } from 'providers/ErrorModalProvider';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';
import APIError from 'types/api/error';

import { isValidDashboardImage } from 'pages/DashboardPage/DashboardContainer/dashboardIcons';

import { normalizeToPostable } from './importUtils';
import JsonEditor from './JsonEditor';

import styles from './NewDashboardModal.module.scss';

interface Props {
	onClose: () => void;
}

function ImportJsonPanel({ onClose }: Props): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const { t } = useTranslation(['dashboard', 'common']);
	const { showErrorModal } = useErrorModal();

	const [editorValue, setEditorValue] = useState('');
	const [isUploadError, setIsUploadError] = useState(false);
	const [isCreateError, setIsCreateError] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleUpload = (event: ChangeEvent<HTMLInputElement>): void => {
		const file = event.target.files?.[0];
		// Reset so picking the same file again still fires a change.
		event.target.value = '';
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = (event): void => {
			try {
				const target = event.target?.result;
				if (!target) {
					return;
				}
				const parsed = JSON.parse(target.toString());
				setEditorValue(JSON.stringify(parsed, null, 2));
				setIsUploadError(false);
			} catch {
				setIsUploadError(true);
				void logEvent(DashboardListEvents.ImportFailed, { reason: 'parse' });
			}
		};
		reader.readAsText(file);
	};

	const handleImport = async (): Promise<void> => {
		try {
			setIsCreating(true);
			logEvent('Dashboard List V2: Import and next clicked', {});
			const parsed = JSON.parse(editorValue) as Record<string, unknown>;
			const payload = normalizeToPostable(parsed);
			// Only an icon/logo path or a base64 image is a storable `image`; reject
			// URLs/markup/other rather than import a value that won't render.
			if (!isValidDashboardImage(payload.image)) {
				setIsCreateError(true);
				void logEvent(DashboardListEvents.ImportFailed, {
					reason: 'invalid-image',
				});
				toast.error(
					'Dashboard "image" must be an /assets/Icons or /assets/Logos path, or a base64 image',
				);
				return;
			}
			const response = await createDashboardV2(payload);
			void logEvent(DashboardListEvents.DashboardCreated, { method: 'import' });
			onClose();
			safeNavigate(
				generatePath(ROUTES.DASHBOARD, { dashboardId: response.data.id }),
			);
		} catch (error) {
			showErrorModal(error as APIError);
			setIsCreateError(true);
			void logEvent(DashboardListEvents.ImportFailed, { reason: 'schema' });
			toast.error(
				error instanceof Error ? error.message : t('error_loading_json'),
			);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<div className={styles.panel}>
			<span className={styles.importHeader}>{t('import_json')}</span>

			<JsonEditor value={editorValue} onChange={setEditorValue} height="280px" />

			{(isCreateError || isUploadError) && (
				<div className={styles.jsonError} role="alert">
					<CircleAlert size={16} />
					<span className={styles.errorText}>
						{isUploadError ? t('error_upload_json') : t('error_loading_json')}
					</span>
				</div>
			)}

			<div className={styles.importFooter}>
				<input
					ref={fileInputRef}
					type="file"
					accept=".json"
					hidden
					data-testid="upload-json-input"
					onChange={handleUpload}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="upload-json-file"
					className="tw:border-input tw:bg-surface-raised tw:dark:bg-surface-raised"
					onClick={(): void => {
						logEvent('Dashboard List V2: Upload JSON file clicked', {});
						fileInputRef.current?.click();
					}}
				>
					<Upload />
					{t('upload_json_file')}
				</Button>

				<Button
					type="button"
					size="sm"
					disabled={isCreating}
					aria-busy={isCreating || undefined}
					data-testid="import-json-submit"
					onClick={handleImport}
				>
					{isCreating && <LoaderCircle className="tw:animate-spin" />}
					<span>{t('import_and_next')}</span>
					<MoveRight />
				</Button>
			</div>
		</div>
	);
}

export default ImportJsonPanel;
