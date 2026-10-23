import { Typography } from '@signozhq/ui/typography';
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { ArrowUpRight } from '@signozhq/icons';
import { DataSource } from 'types/common/queryBuilder';

import eyesEmojiUrl from '@/assets/Images/eyesEmoji.svg';

import './NoLogs.styles.scss';

export default function NoLogs({
	dataSource,
}: {
	dataSource: DataSource;
}): JSX.Element {
	const handleLinkClick = (
		e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
	): void => {
		e.preventDefault();
		e.stopPropagation();

		if (dataSource === DataSource.TRACES) {
			logEvent('Traces Explorer: Navigate to onboarding', {});
		} else if (dataSource === DataSource.LOGS) {
			logEvent('Logs Explorer: Navigate to onboarding', {});
		} else if (dataSource === DataSource.METRICS) {
			logEvent('Metrics Explorer: Navigate to onboarding', {});
		}
		history.push(ROUTES.GET_STARTED);
	};
	return (
		<div className="no-logs-container">
			<div className="no-logs-container-content">
				<img className="eyes-emoji" src={eyesEmojiUrl} alt="eyes emoji" />
				<Typography className="no-logs-text">
					No {dataSource} yet.
					<span className="sub-text">
						{' '}
						When we receive {dataSource}, they would show up here
					</span>
				</Typography>

				<Typography.Link className="send-logs-link" onClick={handleLinkClick}>
					Sending {dataSource} to FuseScope <ArrowUpRight size={16} />
				</Typography.Link>
			</div>
		</div>
	);
}
