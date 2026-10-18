//@ts-nocheck

import { useEffect, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { connect, useSelector } from 'react-redux';
import { withRouter } from 'react-router-dom';
import { Select } from 'antd';
import Graph from 'components/Graph';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import Panel from 'components/PageTemplate/components/Panel';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import { fuseScopeDocsUrl } from 'constants/docs';
import { GetService, getUsageData, UsageDataItem } from 'store/actions';
import { AppState } from 'store/reducers';
import { GlobalTime } from 'types/actions/globalTime';
import { GlobalReducer } from 'types/reducer/globalTime';
import MetricReducer from 'types/reducer/metrics';
import { isOnboardingSkipped } from 'utils/app';
import { ChartColumn } from 'lucide-react';

const { Option } = Select;

interface UsageExplorerProps {
	usageData: UsageDataItem[];
	getUsageData: (
		minTime: number,
		maxTime: number,
		selectedInterval: number,
		selectedService: string,
	) => void;
	getServicesList: ({
		selectedTimeInterval,
	}: {
		selectedTimeInterval: GlobalReducer['selectedTime'];
	}) => void;
	globalTime: GlobalTime;
	servicesList: servicesListItem[];
	totalCount: number;
}
const timeDaysOptions = [
	{ value: 30, label: 'Last 30 Days' },
	{ value: 7, label: 'Last week' },
	{ value: 1, label: 'Last day' },
];

const interval = [
	{
		value: 604800,
		chartDivideMultiplier: 1,
		label: 'Weekly',
		applicableOn: [timeDaysOptions[0]],
	},
	{
		value: 86400,
		chartDivideMultiplier: 30,
		label: 'Daily',
		applicableOn: [timeDaysOptions[0], timeDaysOptions[1]],
	},
	{
		value: 3600,
		chartDivideMultiplier: 10,
		label: 'Hours',
		applicableOn: [timeDaysOptions[2], timeDaysOptions[1]],
	},
];

function _UsageExplorer(props: UsageExplorerProps): JSX.Element {
	const [selectedTime, setSelectedTime] = useState(timeDaysOptions[1]);
	const [selectedInterval, setSelectedInterval] = useState(interval[2]);
	const [selectedService, setSelectedService] = useState<string>('');
	const { selectedTime: globalSelectedTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);
	const { getServicesList, getUsageData, globalTime, totalCount, usageData } =
		props;
	const { services } = useSelector<AppState, MetricReducer>(
		(state) => state.metrics,
	);

	useEffect(() => {
		if (selectedTime && selectedInterval) {
			const maxTime = new Date().getTime() * 1000000;
			const minTime = maxTime - selectedTime.value * 24 * 3600000 * 1000000;

			getUsageData(minTime, maxTime, selectedInterval.value, selectedService);
		}
	}, [selectedTime, selectedInterval, selectedService, getUsageData]);

	useEffect(() => {
		getServicesList({
			selectedTimeInterval: globalSelectedTime,
		});
	}, [globalTime, getServicesList, globalSelectedTime]);

	const data = {
		labels: usageData.map((s) => new Date(s.timestamp / 1000000)),
		datasets: [
			{
				label: 'Span Count',
				data: usageData.map((s) => s.count),
				backgroundColor: 'rgba(255, 99, 132, 0.2)',
				borderColor: 'rgba(255, 99, 132, 1)',
				borderWidth: 2,
			},
		],
	};

	return (
		<PageTemplate testId="usage-explorer-page">
			<PageHeader
				icon={<ChartColumn />}
				title="Usage explorer"
				description={
					isOnboardingSkipped() && totalCount === 0 ? (
						<>
							No spans found. Please add instrumentation (follow this
							<a
								href={fuseScopeDocsUrl('/sending-data/instrumentation/')}
								target="_blank"
								className="tw:ml-[3px]"
								rel="noreferrer"
							>
								guide
							</a>
							)
						</>
					) : (
						<span data-testid="usage-total-count">{`Total count is ${totalCount}`}</span>
					)
				}
				actions={
					<>
						<Select
							onSelect={(value): void => {
								setSelectedTime(
									// eslint-disable-next-line eqeqeq
									timeDaysOptions.filter((item) => item.value == parseInt(value))[0],
								);
							}}
							value={selectedTime.label}
						>
							{timeDaysOptions.map(({ value, label }) => (
								<Option key={value} value={value}>
									{label}
								</Option>
							))}
						</Select>
						<Select
							onSelect={(value): void => {
								setSelectedInterval(
									interval.filter((item) => item.value === parseInt(value))[0],
								);
							}}
							value={selectedInterval.label}
						>
							{interval
								.filter((interval) => interval.applicableOn.includes(selectedTime))
								.map((item) => (
									<Option key={item.label} value={item.value}>
										{item.label}
									</Option>
								))}
						</Select>
						<Select
							onSelect={(value): void => {
								setSelectedService(value);
							}}
							value={selectedService || 'All Services'}
						>
							<Option value="">All Services</Option>
							{services?.map((service) => (
								<Option key={service.serviceName} value={service.serviceName}>
									{service.serviceName}
								</Option>
							))}
						</Select>
					</>
				}
			/>

			<Panel title="Span Count">
				<div className="tw:h-[70vh] tw:p-5">
					<Graph name="usage" data={data} type="bar" />
				</div>
			</Panel>
		</PageTemplate>
	);
}

const mapStateToProps = (
	state: AppState,
): {
	totalCount: number;
	globalTime: GlobalTime;
	usageData: UsageDataItem[];
} => {
	let totalCount = 0;
	for (const item of state.usageDate) {
		totalCount += item.count;
	}
	return {
		totalCount,
		usageData: state.usageDate,
		globalTime: state.globalTime,
	};
};

export const UsageExplorer = withRouter(
	connect(mapStateToProps, {
		getUsageData,
		getServicesList: GetService,
	})(_UsageExplorer),
);
