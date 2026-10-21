import { ReactNode } from 'react';
import SubpageHeader from 'components/Alerts/SubpageHeader/SubpageHeader';
import ROUTES from 'constants/routes';
import { useSafeNavigate } from 'hooks/useSafeNavigate';

interface ChannelFormPageProps {
	title: ReactNode;
	badges?: ReactNode;
	children: ReactNode;
}

/** The new and edit notification channel pages: header band, then the form. */
function ChannelFormPage({
	title,
	badges,
	children,
}: ChannelFormPageProps): JSX.Element {
	const { safeNavigate } = useSafeNavigate();

	return (
		<div className="tw:flex tw:min-h-full tw:w-full tw:flex-col tw:self-start tw:bg-background tw:text-foreground">
			<SubpageHeader
				title={title}
				badges={badges}
				backLabel="Back to notification channels"
				onBack={(): void => safeNavigate(ROUTES.ALL_CHANNELS)}
				testId="channel-form-header"
			/>
			<div className="tw:mx-auto tw:flex tw:w-full tw:max-w-[1600px] tw:flex-1 tw:flex-col tw:px-4 tw:pt-4 tw:pb-6 tw:md:px-6">
				{children}
			</div>
		</div>
	);
}

export default ChannelFormPage;
