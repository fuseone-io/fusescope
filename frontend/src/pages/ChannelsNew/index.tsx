import { useTranslation } from 'react-i18next';
import CreateAlertChannels from 'container/CreateAlertChannels';
import { ChannelType } from 'container/CreateAlertChannels/config';
import ChannelFormPage from 'container/FormAlertChannels/components/ChannelFormPage';

function ChannelsNew(): JSX.Element {
	const { t } = useTranslation('channels');

	return (
		<ChannelFormPage title={t('page_title_create')}>
			<CreateAlertChannels preType={ChannelType.Slack} />
		</ChannelFormPage>
	);
}

export default ChannelsNew;
