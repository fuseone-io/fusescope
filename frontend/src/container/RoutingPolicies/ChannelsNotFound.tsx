import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';
import { openInNewTab } from 'utils/navigation';

interface ChannelsNotFoundProps {
	refreshChannels: () => void;
}

/** The channel picker's empty dropdown: where to create one, and a refresh. */
function ChannelsNotFound({
	refreshChannels,
}: ChannelsNotFoundProps): JSX.Element {
	const { user } = useAppContext();

	return (
		<div className="fs-ui tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-1 tw:font-sans tw:text-[13px] tw:text-muted-foreground">
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
				<span>No channels yet.</span>
				{user?.role === USER_ROLES.ADMIN ? (
					<span>
						Create one
						<Button
							variant="link"
							size="xs"
							className="tw:px-1"
							onClick={(): void => {
								openInNewTab(ROUTES.CHANNELS_NEW);
							}}
						>
							here.
						</Button>
					</span>
				) : (
					<span>Please ask your admin to create one.</span>
				)}
			</div>
			<Button variant="ghost" size="xs" onClick={refreshChannels}>
				Refresh
			</Button>
		</div>
	);
}

export default ChannelsNotFound;
