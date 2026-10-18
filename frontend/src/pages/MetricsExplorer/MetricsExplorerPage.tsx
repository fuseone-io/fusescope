import { useMemo } from 'react';
import { useLocation } from 'react-use';
import ModuleTabsLayout from 'components/PageTemplate/components/ModuleTabsLayout';
import { TabRoutes } from 'components/RouteTab/types';
import ROUTES from 'constants/routes';
import { initialQueriesMap, PANEL_TYPES } from 'constants/queryBuilder';
import { useVolumeControlFeatureGate } from 'hooks/metricsExplorer/useVolumeControlFeatureGate';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useShareBuilderUrl } from 'hooks/queryBuilder/useShareBuilderUrl';
import { useSavedViewEnabled } from 'hooks/useSavedViewEnabled';
import history from 'lib/history';
import { ChartColumn } from 'lucide-react';
import { DataSource } from 'types/common/queryBuilder';

import { Explorer, Summary, Views, VolumeControl } from './constants';

function MetricsExplorerPage(): JSX.Element {
	const { pathname = '' } = useLocation();
	const { isVolumeControlEnabled } = useVolumeControlFeatureGate();
	const isSavedViewEnabled = useSavedViewEnabled();

	const routes: TabRoutes[] = useMemo(
		() => [
			Summary,
			...(isVolumeControlEnabled ? [VolumeControl] : []),
			Explorer,
			...(isSavedViewEnabled ? [] : [Views]),
		],
		[isVolumeControlEnabled, isSavedViewEnabled],
	);

	const { updateAllQueriesOperators } = useQueryBuilder();

	const defaultQuery = useMemo(
		() =>
			updateAllQueriesOperators(
				initialQueriesMap[DataSource.METRICS],
				PANEL_TYPES.LIST,
				DataSource.METRICS,
			),
		[updateAllQueriesOperators],
	);

	useShareBuilderUrl({ defaultValue: defaultQuery });

	return (
		<ModuleTabsLayout
			title="Metrics"
			icon={<ChartColumn />}
			testId="metrics-explorer-page"
			routes={routes}
			activeKey={pathname}
			history={history}
			contentClassName={
				pathname === ROUTES.METRICS_EXPLORER_EXPLORER
					? undefined
					: 'tw:px-4 tw:py-4 tw:md:px-6'
			}
		/>
	);
}

export default MetricsExplorerPage;
