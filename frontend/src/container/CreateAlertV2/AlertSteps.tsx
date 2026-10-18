import AlertCondition from './AlertCondition';
import NotificationSettings from './NotificationSettings';
import QuerySection from './QuerySection';
import StepsNav from './StepsNav/StepsNav';

/** The three numbered step panels with their jump list. */
function AlertSteps(): JSX.Element {
	return (
		<div className="tw:flex tw:items-start tw:gap-6">
			<StepsNav />
			<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-4">
				<QuerySection />
				<AlertCondition />
				<NotificationSettings />
			</div>
		</div>
	);
}

export default AlertSteps;
