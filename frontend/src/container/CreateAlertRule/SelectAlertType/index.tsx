import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import logEvent from 'api/common/logEvent';
import { ALERTS_DATA_SOURCE_MAP } from 'constants/alerts';
import { FeatureKeys } from 'constants/features';
import { useAppContext } from 'providers/App/App';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import {
	Activity,
	BarChart3,
	Bug,
	DraftingCompass,
	ScrollText,
} from 'lucide-react';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { isModifierKeyPressed } from 'utils/app';
import { openInNewTab } from 'utils/navigation';

import { ALERT_TYPE_URL_MAP } from '../constants';
import { getOptionList } from './config';
import { OptionType } from './types';

const ALERT_TYPE_ICONS: Record<AlertTypes, typeof Activity> = {
	[AlertTypes.ANOMALY_BASED_ALERT]: Activity,
	[AlertTypes.METRICS_BASED_ALERT]: BarChart3,
	[AlertTypes.LOGS_BASED_ALERT]: ScrollText,
	[AlertTypes.TRACES_BASED_ALERT]: DraftingCompass,
	[AlertTypes.EXCEPTIONS_BASED_ALERT]: Bug,
};

function SelectAlertType({ onSelect }: SelectAlertTypeProps): JSX.Element {
	const { t } = useTranslation(['alerts']);
	const { featureFlags } = useAppContext();

	const isAnomalyDetectionEnabled =
		featureFlags?.find((flag) => flag.name === FeatureKeys.ANOMALY_DETECTION)
			?.active || false;

	const optionList = getOptionList(t, isAnomalyDetectionEnabled);

	function handleRedirection(option: AlertTypes): void {
		const url = ALERT_TYPE_URL_MAP[option]?.selection ?? '';

		logEvent('Alert: Sample alert link clicked', {
			dataSource: ALERTS_DATA_SOURCE_MAP[option],
			link: url,
			page: 'New alert data source selection page',
		});

		openInNewTab(url);
	}
	const renderOptions = useMemo(
		() => (
			<>
				{optionList.map((option: OptionType) => {
					const Icon = ALERT_TYPE_ICONS[option.selection];
					return (
						<div
							key={option.selection}
							role="button"
							tabIndex={0}
							data-testid={`alert-type-card-${option.selection}`}
							onClick={(e): void => {
								onSelect(option.selection, isModifierKeyPressed(e));
							}}
							onKeyDown={(e): void => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onSelect(option.selection);
								}
							}}
							className="tw:flex tw:cursor-pointer tw:flex-col tw:gap-3 tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:p-5 tw:text-left tw:transition-colors tw:outline-none tw:hover:border-primary tw:focus-visible:ring-2 tw:focus-visible:ring-ring"
						>
							<div className="tw:flex tw:items-center tw:gap-3">
								<span
									aria-hidden="true"
									className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
								>
									<Icon className="tw:size-[18px]" />
								</span>
								<h2 className="tw:text-[15px] tw:font-semibold tw:text-foreground">
									{option.title}
								</h2>
								{option.isBeta && <StatusBadge tone="info">Beta</StatusBadge>}
							</div>
							<p className="tw:text-[13px] tw:leading-relaxed tw:text-muted-foreground">
								{option.description}{' '}
								<button
									type="button"
									onClick={(e): void => {
										e.preventDefault();
										e.stopPropagation();
										handleRedirection(option.selection);
									}}
									className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:text-primary tw:hover:underline"
								>
									Click here to see how to create a sample alert.
								</button>
							</p>
						</div>
					);
				})}
			</>
		),
		[onSelect, optionList],
	);

	return (
		<div className="fs-ui tw:flex tw:flex-col tw:gap-4 tw:font-sans">
			<h2 className="tw:text-base tw:font-semibold tw:text-foreground">
				{t('choose_alert_type')}
			</h2>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] tw:gap-4">
				{renderOptions}
			</div>
		</div>
	);
}

interface SelectAlertTypeProps {
	onSelect: (type: AlertTypes, newTab?: boolean) => void;
}

export default SelectAlertType;
