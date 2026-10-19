import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import { Check } from 'lucide-react';

function SaveConfigButton({
	showSaveButton,
	onSaveConfigurationHandler,
	onCancelConfigurationHandler,
}: SaveConfigButtonTypes): JSX.Element {
	const { t } = useTranslation('pipeline');

	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-card tw:px-4 tw:py-3 tw:font-sans">
			<span className="tw:text-[13px] tw:text-muted-foreground">
				{showSaveButton
					? 'You have unsaved changes. Saving deploys a new configuration version to the collectors.'
					: 'Drag rows to reorder, toggle to enable or disable, or add a new pipeline.'}
			</span>
			<div className="tw:flex tw:gap-2">
				<Button
					key="cancel"
					variant="outline"
					size="sm"
					onClick={onCancelConfigurationHandler}
				>
					{t('cancel')}
				</Button>
				{showSaveButton && (
					<Button
						key="submit"
						size="sm"
						type="submit"
						onClick={onSaveConfigurationHandler}
					>
						<Check />
						{t('save_configuration')}
					</Button>
				)}
			</div>
		</div>
	);
}
export interface SaveConfigButtonTypes {
	showSaveButton: boolean;
	onSaveConfigurationHandler: VoidFunction;
	onCancelConfigurationHandler: VoidFunction;
}

export default SaveConfigButton;
