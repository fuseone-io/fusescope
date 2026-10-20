import { type ChangeEvent, useState } from 'react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { toast } from '@signozhq/ui/sonner';
import { LoaderCircle } from 'lucide-react';
import { AxiosError } from 'axios';
import { generatePath } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import { createDashboardV2 } from 'api/generated/services/dashboard';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { useErrorModal } from 'providers/ErrorModalProvider';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';
import APIError from 'types/api/error';
import TagKeyValueInput from 'components/TagKeyValueInput/TagKeyValueInput';

import { keyValueStringsToTags } from '../../utils/helpers';

import DashboardImagePicker from '../../../DashboardPage/DashboardContainer/DashboardSettings/Overview/DashboardImagePicker/DashboardImagePicker';
import { DEFAULT_DASHBOARD_ICON_PATH } from 'pages/DashboardPage/DashboardContainer/dashboardIcons';
import { DASHBOARD_NAME_MAX_LENGTH } from '../../../DashboardPage/DashboardContainer/constants';
import styles from './NewDashboardModal.module.scss';

const DEFAULT_NAME = 'Sample Dashboard';

const FIELD =
	'tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised';

interface Props {
	onClose: () => void;
}

function BlankDashboardPanel({ onClose }: Props): JSX.Element {
	const { safeNavigate } = useSafeNavigate();
	const { showErrorModal } = useErrorModal();

	const [name, setName] = useState(DEFAULT_NAME);
	const [description, setDescription] = useState('');
	const [image, setImage] = useState<string>(DEFAULT_DASHBOARD_ICON_PATH);
	const [tags, setTags] = useState<string[]>([]);
	const [submitting, setSubmitting] = useState(false);

	const canSubmit = name.trim().length > 0 && !submitting;

	const handleCreate = async (): Promise<void> => {
		if (!canSubmit) {
			return;
		}
		try {
			setSubmitting(true);
			logEvent('Dashboard List: Create dashboard clicked', {});
			const postableTags = keyValueStringsToTags(tags);
			const created = await createDashboardV2({
				schemaVersion: 'v6',
				generateName: true,
				image,
				tags: postableTags.length ? postableTags : null,
				spec: {
					display: {
						name: name.trim(),
						description: description.trim() || undefined,
					},
					layouts: [],
					panels: {},
					variables: [],
				},
			});
			void logEvent(DashboardListEvents.DashboardCreated, {
				method: 'blank',
				hasDescription: Boolean(description.trim()),
				tagCount: postableTags.length,
				hasImage: Boolean(image),
			});
			onClose();
			safeNavigate(
				generatePath(ROUTES.DASHBOARD, { dashboardId: created.data.id }),
			);
		} catch (e) {
			showErrorModal(e as APIError);
			toast.error((e as AxiosError).toString() || 'Failed to create dashboard');
			setSubmitting(false);
		}
	};

	return (
		<div className={styles.panel}>
			<div className={styles.form}>
				<div className={styles.field}>
					<label htmlFor="create-dashboard-name" className={styles.label}>
						Title <span className={styles.required}>*</span>
					</label>
					<div className={styles.titleRow}>
						<DashboardImagePicker
							image={image}
							onChange={setImage}
							triggerClassName={styles.imageTrigger}
						/>
						<Input
							id="create-dashboard-name"
							className={`${FIELD} ${styles.titleInput}`}
							value={name}
							autoFocus
							maxLength={DASHBOARD_NAME_MAX_LENGTH}
							placeholder="e.g. Sample Dashboard"
							data-testid="create-dashboard-name"
							onChange={(e: ChangeEvent<HTMLInputElement>): void =>
								setName(e.target.value)
							}
							onKeyDown={(e): void => {
								if (e.key === 'Enter') {
									void handleCreate();
								}
							}}
						/>
					</div>
				</div>

				<div className={styles.field}>
					<label htmlFor="create-dashboard-description" className={styles.label}>
						Description
					</label>
					<textarea
						id="create-dashboard-description"
						value={description}
						rows={3}
						placeholder="What is this dashboard for?"
						data-testid="create-dashboard-description"
						className={`${FIELD} ${styles.textarea}`}
						onChange={(e): void => setDescription(e.target.value)}
					/>
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Tags</span>
					<TagKeyValueInput
						tags={tags}
						onTagsChange={setTags}
						placeholder="team:jarvis (press Enter)"
						testId="create-dashboard-tags"
					/>
					<span className={styles.hint}>
						Use key:value (e.g. team:jarvis) and press Enter to add.
					</span>
				</div>
			</div>

			<div className={styles.footer}>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onClose}
					data-testid="create-dashboard-cancel"
				>
					Cancel
				</Button>
				<TitleTooltip
					title={
						name.trim().length === 0 ? 'Enter a dashboard name first' : undefined
					}
				>
					<span className="tw:inline-flex">
						<Button
							type="button"
							size="sm"
							disabled={name.trim().length === 0 || submitting}
							aria-busy={submitting || undefined}
							data-testid="create-dashboard-submit"
							onClick={(): void => {
								void handleCreate();
							}}
						>
							{submitting && <LoaderCircle className="tw:animate-spin" />}
							<span>Create dashboard</span>
						</Button>
					</span>
				</TitleTooltip>
			</div>
		</div>
	);
}

export default BlankDashboardPanel;
