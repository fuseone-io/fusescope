import { useTranslation } from 'react-i18next';
import type { TabsProps } from 'antd';
import { Collapse, Tabs } from 'antd';
import { CircleArrowRight } from 'lucide-react';

import CustomerStoryCard from './CustomerStoryCard';
import InfoBlocks from './InfoBlocks';
import UpgradeButton from './UpgradeButton';
import {
	customerStoriesData,
	enterpriseGradeValuesData,
	faqData,
	infoData,
} from './workspaceLocked.data';

interface WorkspaceLockedTabsProps {
	isLoading: boolean;
	onUpgrade: () => void;
	onTabClick: (key: string) => void;
	onCollapseChange: (key: string | string[]) => void;
}

const PANE_CLASS = 'fs-ui tw:flex tw:flex-col tw:gap-8 tw:pt-2 tw:font-sans';

function WorkspaceLockedTabs({
	isLoading,
	onUpgrade,
	onTabClick,
	onCollapseChange,
}: WorkspaceLockedTabsProps): JSX.Element {
	const { t } = useTranslation(['workspaceLocked']);

	const upgradeButton = (
		<div className="fs-ui tw:flex tw:justify-center tw:font-sans">
			<UpgradeButton isLoading={isLoading} onClick={onUpgrade}>
				{t('continueToUpgrade')}
			</UpgradeButton>
		</div>
	);

	const tabItems: TabsProps['items'] = [
		{
			key: 'whyChooseSignoz',
			label: t('whyChooseSignoz'),
			children: (
				<div className="tw:flex tw:flex-col tw:gap-8">
					<div className={PANE_CLASS}>
						<InfoBlocks items={infoData} />
						<div className="tw:flex tw:flex-col tw:gap-3">
							<div>
								<h3 className="tw:text-base tw:font-semibold">
									{t('enterpriseGradeObservability')}
								</h3>
								<p className="tw:mt-1 tw:text-sm tw:text-muted-foreground">
									{t('observabilityDescription')}
								</p>
							</div>
							<ul className="tw:flex tw:flex-col tw:divide-y tw:divide-border tw:rounded-lg tw:border tw:border-border">
								{enterpriseGradeValuesData.map((item) => (
									<li
										key={item.title}
										className="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3 tw:text-sm"
									>
										<CircleArrowRight className="tw:size-4 tw:text-primary-ink" />
										{item.title}
									</li>
								))}
							</ul>
						</div>
					</div>
					{upgradeButton}
				</div>
			),
		},
		{
			key: 'youAreInGoodCompany',
			label: t('youAreInGoodCompany'),
			children: (
				<div className="tw:flex tw:flex-col tw:gap-8">
					{customerStoriesData.length > 0 && (
						<div className="fs-ui tw:grid tw:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] tw:gap-4 tw:font-sans">
							{customerStoriesData.map((story) => (
								<CustomerStoryCard
									avatar={story.avatar}
									personName={story.personName}
									role={story.role}
									message={story.message}
									link={story.link}
									key={story.key}
								/>
							))}
						</div>
					)}
					{upgradeButton}
				</div>
			),
		},
		// #TODO: comming soon
		// {
		// 	key: '3',
		// 	label: 'Our Pricing',
		// 	children: 'Our Pricing',
		// },
		{
			key: 'faqs',
			label: t('faqs'),
			children: (
				<div className="tw:flex tw:flex-col tw:gap-8">
					{faqData.length > 0 && (
						<Collapse
							items={faqData}
							defaultActiveKey={['signoz-cloud-vs-community']}
							onChange={onCollapseChange}
						/>
					)}
					{upgradeButton}
				</div>
			),
		},
	];

	return (
		<section className="tw:box-border tw:rounded-xl tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:pb-6">
			<Tabs
				centered
				items={tabItems}
				defaultActiveKey="youAreInGoodCompany"
				onTabClick={onTabClick}
			/>
		</section>
	);
}

export default WorkspaceLockedTabs;
