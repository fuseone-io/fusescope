import { useLocation } from 'react-router-dom';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { ListMinus } from 'lucide-react';
import CeleryOverview from 'pages/Celery/CeleryOverview/CeleryOverview';

import CeleryTask from '../Celery/CeleryTask/CeleryTask';
import MessagingQueues from './MessagingQueues';
import MQDetailPage from './MQDetailPage/MQDetailPage';

export const Kafka: TabRoutes = {
	Component: MessagingQueues,
	name: 'Kafka',
	route: ROUTES.MESSAGING_QUEUES_KAFKA,
	key: ROUTES.MESSAGING_QUEUES_KAFKA,
};

export const KafkaDetail: TabRoutes = {
	Component: MQDetailPage,
	name: 'Kafka',
	route: ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL,
	key: ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL,
};

export const Celery: TabRoutes = {
	Component: CeleryTask,
	name: 'Celery',
	route: ROUTES.MESSAGING_QUEUES_CELERY_TASK,
	key: ROUTES.MESSAGING_QUEUES_CELERY_TASK,
};

export const Overview: TabRoutes = {
	Component: CeleryOverview,
	name: 'Overview',
	route: ROUTES.MESSAGING_QUEUES_OVERVIEW,
	key: ROUTES.MESSAGING_QUEUES_OVERVIEW,
};

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
			testId="messaging-queues-page"
		/>
	);
}
