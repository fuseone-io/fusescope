import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Check, Loader2, X } from 'lucide-react';

import {
	BADGE_WARNING,
	BUTTON_GHOST,
	BUTTON_SM,
} from '../../components/settingsClassNames';
import SettingsSheetFooter from '../../components/SettingsSheetFooter';

interface UnsavedChangesFooterProps {
	count: number;
	isSaving: boolean;
	onDiscard: () => void;
	onSave: () => void;
}

function UnsavedChangesFooter({
	count,
	isSaving,
	onDiscard,
	onSave,
}: UnsavedChangesFooterProps): JSX.Element {
	const { t } = useTranslation('common');

	return (
		<SettingsSheetFooter
			status={
				<span className={BADGE_WARNING}>
					{`${count} unsaved change${count > 1 ? 's' : ''}`}
				</span>
			}
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={BUTTON_GHOST}
				disabled={isSaving}
				onClick={onDiscard}
			>
				<X aria-hidden="true" />
				Discard
			</Button>
			<Button
				type="button"
				size="sm"
				className={cn(BUTTON_SM, 'tw:hover:bg-primary-strong')}
				disabled={isSaving}
				data-testid="save-dashboard-config"
				onClick={onSave}
			>
				{isSaving ? (
					<Loader2 className="tw:animate-spin" aria-hidden="true" />
				) : (
					<Check aria-hidden="true" />
				)}
				<span>{t('save')}</span>
			</Button>
		</SettingsSheetFooter>
	);
}

export default UnsavedChangesFooter;
