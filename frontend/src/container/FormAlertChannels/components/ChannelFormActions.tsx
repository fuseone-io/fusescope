import { useTranslation } from 'react-i18next';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { Check, Loader2, Send } from 'lucide-react';

interface ChannelFormActionsProps {
	onSave: () => void;
	onTest: () => void;
	savingState: boolean;
	testingState: boolean;
}

/** Sticky at the bottom of the scrolling page, bleeding over its padding. */
function ChannelFormActions({
	onSave,
	onTest,
	savingState,
	testingState,
}: ChannelFormActionsProps): JSX.Element {
	const { t } = useTranslation('channels');

	return (
		<div
			data-testid="channel-form-actions"
			className="fs-ui tw:sticky tw:bottom-0 tw:z-10 tw:-mx-4 tw:-mb-6 tw:mt-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-sans tw:md:-mx-6 tw:md:px-6"
		>
			<span className="tw:text-xs tw:text-muted-foreground">
				Test sends a sample alert to this channel.
			</span>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<Button
					variant="outline"
					data-testid="test-channel-button"
					disabled={testingState}
					aria-busy={testingState}
					onClick={onTest}
				>
					{testingState ? (
						<Loader2 aria-hidden="true" className="tw:animate-spin" />
					) : (
						<Send aria-hidden="true" />
					)}
					<span className="translate-safe">{t('button_test_channel')}</span>
				</Button>
				<Button
					variant="ghost"
					data-testid="return-button"
					onClick={(): void => {
						history.replace(ROUTES.ALL_CHANNELS);
					}}
				>
					{t('button_return')}
				</Button>
				<Button
					data-testid="save-channel-button"
					disabled={savingState}
					aria-busy={savingState}
					onClick={onSave}
				>
					{savingState ? (
						<Loader2 aria-hidden="true" className="tw:animate-spin" />
					) : (
						<Check aria-hidden="true" />
					)}
					<span className="translate-safe">{t('button_save_channel')}</span>
				</Button>
			</div>
		</div>
	);
}

export default ChannelFormActions;
