import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { Tooltip } from 'antd';
import getAll from 'api/channels/getAll';
import logEvent from 'api/common/logEvent';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import Spinner from 'components/Spinner';
import TextToolTip from 'components/TextToolTip';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import useComponentPermission from 'hooks/useComponentPermission';
import history from 'lib/history';
import { isUndefined } from 'lodash-es';
import { Plus } from 'lucide-react';
import AlertsHeaderActions from 'pages/AlertList/components/AlertsHeaderActions';
import { useAppContext } from 'providers/App/App';
import { SuccessResponseV2 } from 'types/api';
import { Channels } from 'types/api/channels/getAll';
import APIError from 'types/api/error';

import AlertChannelsComponent from './AlertChannels';

function AlertChannels(): JSX.Element {
	const { t } = useTranslation(['channels']);
	const { user } = useAppContext();
	const [addNewChannelPermission] = useComponentPermission(
		['add_new_channel'],
		user.role,
	);
	const onToggleHandler = useCallback(() => {
		history.push(ROUTES.CHANNELS_NEW);
	}, []);

	const { isLoading, data, error } = useQuery<
		SuccessResponseV2<Channels[]>,
		APIError
	>(['getChannels'], {
		queryFn: () => getAll(),
	});

	useEffect(() => {
		if (!isUndefined(data?.data)) {
			logEvent('Alert Channel: Channel list page visited', {
				number: data?.data?.length,
			});
		}
	}, [data?.data]);

	if (error) {
		return (
			<p className="fs-ui tw:font-sans tw:text-sm tw:text-error-ink">
				{error.getErrorMessage()}
			</p>
		);
	}

	if (isLoading || isUndefined(data?.data)) {
		return <Spinner tip={t('loading_channels_message')} height="90vh" />;
	}

	const channels = data?.data || [];

	return (
		<div className="tw:flex tw:w-full tw:flex-col tw:gap-3">
			<AlertsHeaderActions>
				<Tooltip
					title={
						!addNewChannelPermission
							? 'Ask an admin to create alert channel'
							: undefined
					}
				>
					<span>
						<Button
							onClick={onToggleHandler}
							disabled={!addNewChannelPermission}
							data-testid="new-alert-channel-button"
						>
							<Plus aria-hidden="true" />
							{t('button_new_channel')}
						</Button>
					</span>
				</Tooltip>
			</AlertsHeaderActions>
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-sans">
				<p className="tw:min-w-0 tw:truncate tw:text-[13px] tw:text-muted-foreground">
					{t('sending_channels_note')}
				</p>
				<TextToolTip
					text={t('tooltip_notification_channels')}
					url={fuseScopeDocsUrl('/alerts/notification-channels/')}
				/>
			</div>

			<ContentPanel
				testId="alert-channels-panel"
				footer={
					<span className="tw:tabular-nums">
						{channels.length} {channels.length === 1 ? 'channel' : 'channels'}
					</span>
				}
			>
				<AlertChannelsComponent allChannels={channels} />
			</ContentPanel>
		</div>
	);
}

export default AlertChannels;
