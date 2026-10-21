import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath } from 'react-router-dom';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import TagChip from 'components/PageTemplate/components/TagChip';
import ROUTES from 'constants/routes';
import useComponentPermission from 'hooks/useComponentPermission';
import { useNotifications } from 'hooks/useNotifications';
import history from 'lib/history';
import { useAppContext } from 'providers/App/App';
import { Channels } from 'types/api/channels/getAll';
import { Pencil } from 'lucide-react';

import Delete from './Delete';

function AlertChannels({ allChannels }: AlertChannelsProps): JSX.Element {
	const { t } = useTranslation(['channels']);
	const { notifications } = useNotifications();
	const { user } = useAppContext();
	const [action] = useComponentPermission(['new_alert_action'], user.role);

	const onClickEditHandler = useCallback((id: string) => {
		history.push(
			generatePath(ROUTES.CHANNELS_EDIT, {
				channelId: id,
			}),
		);
	}, []);

	return (
		<Table data-testid="alert-channels-table">
			<TableHeader className="tw:bg-surface-sunken">
				<TableRow>
					<TableHead>{t('column_channel_name')}</TableHead>
					<TableHead>{t('column_channel_type')}</TableHead>
					{action && (
						<TableHead className="tw:text-right">
							{t('column_channel_action')}
						</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{allChannels.map((channel) => (
					<TableRow key={channel.id}>
						<TableCell className="tw:font-medium">{channel.name}</TableCell>
						<TableCell>
							<TagChip>{channel.type}</TagChip>
						</TableCell>
						{action && (
							<TableCell className="tw:text-right">
								<Button
									variant="ghost"
									size="sm"
									onClick={(): void => onClickEditHandler(channel.id)}
								>
									<Pencil aria-hidden="true" />
									{t('column_channel_edit')}
								</Button>
								<Delete id={channel.id} notifications={notifications} />
							</TableCell>
						)}
					</TableRow>
				))}
				{allChannels.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={action ? 3 : 2}
							className="tw:h-24 tw:text-center tw:text-muted-foreground"
						>
							No notification channels yet
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}

interface AlertChannelsProps {
	allChannels: Channels[];
}

export default AlertChannels;
