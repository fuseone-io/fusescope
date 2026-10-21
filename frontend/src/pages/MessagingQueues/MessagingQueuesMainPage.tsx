import { useLocation } from 'react-router-dom';
import MessagingQueueHealthCheck from 'components/MessagingQueueHealthCheck/MessagingQueueHealthCheck';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { LayoutGrid, ListMinus, ListTodo, Waypoints } from 'lucide-react';
import CeleryOverview from 'pages/Celery/CeleryOverview/CeleryOverview';

import CeleryTask from '../Celery/CeleryTask/CeleryTask';
import CopyLinkButton from './CopyLinkButton';
import MessagingQueues from './MessagingQueues';
import { MessagingQueueHealthCheckService } from './MessagingQueuesUtils';
import MQDetailPage from './MQDetailPage/MQDetailPage';

export const Kafka: TabRoutes = {
	Component: MessagingQueues,
	name: 'Kafka',
	route: ROUTES.MESSAGING_QUEUES_KAFKA,
	key: ROUTES.MESSAGING_QUEUES_KAFKA,
	icon: <Waypoints />,
};

export const KafkaDetail: TabRoutes = {
	Component: MQDetailPage,
	name: 'Kafka',
	route: ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL,
	key: ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL,
	icon: <Waypoints />,
};

export const Celery: TabRoutes = {
	Component: CeleryTask,
	name: 'Celery',
	route: ROUTES.MESSAGING_QUEUES_CELERY_TASK,
	key: ROUTES.MESSAGING_QUEUES_CELERY_TASK,
	icon: <ListTodo />,
};

export const Overview: TabRoutes = {
	Component: CeleryOverview,
	name: 'Overview',
	route: ROUTES.MESSAGING_QUEUES_OVERVIEW,
	key: ROUTES.MESSAGING_QUEUES_OVERVIEW,
	icon: <LayoutGrid />,
};

const HEALTH_CHECK_SERVICES = [
	MessagingQueueHealthCheckService.Consumers,
	MessagingQueueHealthCheckService.Producers,
	MessagingQueueHealthCheckService.Kafka,
];

function pageActions(pathname: string): JSX.Element | undefined {
	if (pathname === ROUTES.MESSAGING_QUEUES_KAFKA) {
		return (
			<span className="fs-ui tw:font-sans">
				<MessagingQueueHealthCheck
					serviceToInclude={HEALTH_CHECK_SERVICES}
					openWhenMissing
				/>
			</span>
		);
	}
	if (pathname === ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL) {
		return (
			<span className="fs-ui tw:font-sans">
				<CopyLinkButton />
			</span>
		);
	}
	return undefined;
}

export default function MessagingQueuesMainPage(): JSX.Element {
	const { pathname } = useLocation();

	const isKafkaDetail = pathname === ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL;

	const routes: TabRoutes[] = [
		Overview,
		isKafkaDetail ? KafkaDetail : Kafka,
		Celery,
	];

	return (
		<ModuleTabsLayout
			title="Messaging Queues"
			icon={<ListMinus />}
			routes={routes}
			activeKey={pathname}
			history={history}
			actions={pageActions(pathname)}
			testId="messaging-queues-page"
			contentClassName="tw:flex tw:flex-col tw:gap-4 tw:p-4 tw:md:p-6"
		/>
	);
}
