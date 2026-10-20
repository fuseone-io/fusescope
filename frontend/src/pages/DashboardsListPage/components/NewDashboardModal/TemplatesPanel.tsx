import { type ChangeEvent, type KeyboardEvent, useState } from 'react';
import {
	Check,
	LayoutDashboard,
	LoaderCircle,
	SquareArrowOutUpRight,
} from 'lucide-react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { toast } from '@signozhq/ui/sonner';
import logEvent from 'api/common/logEvent';
import { fuseScopeDocsUrl } from 'constants/docs';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';

import styles from './NewDashboardModal.module.scss';

const TEMPLATES_DOCS_URL = fuseScopeDocsUrl('/reference/dashboard-json/');

// Templates aren't served by the BE yet, so this tab is a browse-and-request
// placeholder: link out to the published template library, and let cloud users
// request one we haven't built.
function TemplatesPanel(): JSX.Element {
	const { isCloudUser } = useGetTenantLicense();
	const [name, setName] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const requestName = name.trim();

	const handleRequest = async (): Promise<void> => {
		if (!requestName || submitting) {
			return;
		}
		try {
			setSubmitting(true);
			const response = await logEvent('Dashboard Requested', {
				screen: 'Dashboard list page',
				dashboard: requestName,
			});
			if (response.statusCode === 200) {
				toast.success('Dashboard request submitted');
				setName('');
			} else {
				toast.error(response.error || 'Something went wrong');
			}
		} catch {
			toast.error('Something went wrong');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className={styles.templatesPanel}>
			<span className={styles.templatesIcon}>
				<LayoutDashboard size={20} />
			</span>
			<h3 className={styles.templatesTitle}>Dashboard templates</h3>
			<p className={styles.templatesDesc}>
				Browse our library of ready-made dashboards, or request a new one and
				we&apos;ll build it for you.
			</p>

			<a
				className={styles.browseLink}
				href={TEMPLATES_DOCS_URL}
				target="_blank"
				rel="noopener noreferrer"
			>
				Browse dashboard templates
				<SquareArrowOutUpRight size={14} />
			</a>

			{isCloudUser && (
				<div className={styles.requestForm}>
					<span className={styles.requestHeader}>Request a new template</span>
					<div className={styles.requestRow}>
						<Input
							className="tw:h-8 tw:flex-1 tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised"
							placeholder="Enter dashboard name..."
							aria-label="Dashboard name"
							value={name}
							data-testid="request-dashboard-name"
							onChange={(e: ChangeEvent<HTMLInputElement>): void =>
								setName(e.target.value)
							}
							onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
								if (e.key === 'Enter') {
									void handleRequest();
								}
							}}
						/>
						<Button
							type="button"
							size="sm"
							title={
								requestName.length === 0 ? 'Enter a dashboard name first' : undefined
							}
							disabled={requestName.length === 0 || submitting}
							aria-busy={submitting || undefined}
							data-testid="request-dashboard-submit"
							onClick={(): void => {
								void handleRequest();
							}}
						>
							{submitting ? <LoaderCircle className="tw:animate-spin" /> : <Check />}
							Submit
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export default TemplatesPanel;
