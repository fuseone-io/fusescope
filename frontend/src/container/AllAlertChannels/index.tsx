import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { Tooltip } from 'antd';
import getAll from 'api/channels/getAll';
import logEvent from 'api/common/logEvent';
import Panel from 'components/PageTemplate/components/Panel';
import Spinner from 'components/Spinner';
import TextToolTip from 'components/TextToolTip';
import { Button } from 'components/ui/button';
import { fuseScopeDocsUrl } from 'constants/docs';
import ROUTES from 'constants/routes';
import useComponentPermission from 'hooks/useComponentPermission';
import history from 'lib/history';
import { isUndefined } from 'lodash-es';
import { Plus } from 'lucide-react';
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

	return (
		<div className="tw:flex tw:w-full tw:flex-col tw:gap-3">
			<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:font-sans">
				<p className="tw:min-w-0 tw:truncate tw:text-sm tw:text-muted-foreground">
					{t('sending_channels_note')}
				</p>
				<div className="tw:flex tw:items-center tw:gap-2">
					<TextToolTip
						text={t('tooltip_notification_channels')}
						url={fuseScopeDocsUrl('/alerts/notification-channels/')}
					/>
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
				</div>
			</div>

			<Panel testId="alert-channels-panel" className="tw:overflow-hidden">
				<AlertChannelsComponent allChannels={data?.data || []} />
			</Panel>
		</div>
	);
}

export default AlertChannels;
