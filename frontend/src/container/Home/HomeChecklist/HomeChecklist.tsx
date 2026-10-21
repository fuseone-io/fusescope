import { useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { USER_ROLES } from 'types/roles';
import { openInNewTab } from 'utils/navigation';

import ChecklistStep from './ChecklistStep';

export type ChecklistItem = {
	id: string;
	title: string;
	description: string;
	completed: boolean;
	isSkipped: boolean;
	isSkippable?: boolean;
	skippedPreferenceKey?: string;
	toRoute?: string;
	docsLink?: string;
};

function HomeChecklist({
	checklistItems,
	onSkip,
	isLoading,
}: {
	checklistItems: ChecklistItem[];
	onSkip: (item: ChecklistItem) => void;
	isLoading: boolean;
}): JSX.Element {
	const { user, activeLicense } = useAppContext();

	const activeId = useMemo(
		() => checklistItems.find((item) => !item.completed && !item.isSkipped)?.id,
		[checklistItems],
	);

	const handleGetStarted = (item: ChecklistItem): void => {
		void logEvent('Welcome Checklist: Get started clicked', {
			step: item.id,
		});

		if (item.toRoute !== ROUTES.GET_STARTED_WITH_CLOUD) {
			history.push(item.toRoute || '');
		} else if (
			activeLicense &&
			activeLicense.platform === LicensePlatform.CLOUD
		) {
			history.push(item.toRoute || '');
		} else {
			openInNewTab(item.docsLink || '');
		}
	};

	const handleDocs = (item: ChecklistItem): void => {
		void logEvent('Welcome Checklist: Docs clicked', {
			step: item.id,
		});

		openInNewTab(item.docsLink ?? '');
	};

	const handleSkip = (item: ChecklistItem): void => {
		void logEvent('Welcome Checklist: Skip clicked', {
			step: item.id,
		});
		onSkip(item);
	};

	return (
		<ol
			data-testid="home-checklist"
			className="fs-ui tw:flex tw:flex-col tw:font-sans"
		>
			{checklistItems.map((item) => (
				<ChecklistStep
					key={item.id}
					item={item}
					active={item.id === activeId}
					canAct={user?.role !== USER_ROLES.VIEWER}
					isLoading={isLoading}
					onGetStarted={handleGetStarted}
					onDocs={handleDocs}
					onSkip={handleSkip}
				/>
			))}
		</ol>
	);
}

export default HomeChecklist;
