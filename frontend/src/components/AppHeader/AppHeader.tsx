import { useLocation } from 'react-router-dom';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';

import GlobalTimeControls from './components/GlobalTimeControls';
import { HeaderPageActionsSlot } from './components/HeaderPageActions';
import HeaderBreadcrumb from './components/HeaderBreadcrumb';
import SearchTrigger from './components/SearchTrigger';
import SidebarToggle from './components/SidebarToggle';
import { showsGlobalTimePicker, showsHeaderActionsOnly } from './utils';

import styles from './AppHeader.module.scss';

/** The top bar of every page with the sidebar; render inside `AppSidebarProvider`. */
function AppHeader(): JSX.Element {
	const { pathname } = useLocation();

	return (
		<header
			data-testid="app-header"
			className="tw:flex tw:min-h-14 tw:shrink-0 tw:flex-wrap tw:items-center tw:lg:flex-nowrap tw:gap-x-3 tw:gap-y-2 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:text-foreground tw:md:px-8"
		>
			<div className="fs-ui tw:flex tw:min-w-0 tw:flex-[1_0.1_auto] tw:items-center tw:gap-2 tw:font-sans">
				<SidebarToggle />
				<HeaderBreadcrumb />
			</div>
			<div className="fs-ui tw:flex tw:shrink tw:items-center tw:font-sans tw:md:w-80 tw:md:min-w-48">
				<SearchTrigger />
			</div>
			<HeaderPageActionsSlot />
			{showsGlobalTimePicker(pathname) && <GlobalTimeControls />}
			{showsHeaderActionsOnly(pathname) && (
				<div className={styles.timeControls} data-testid="app-header-actions">
					<HeaderRightSection
						enableShare
						enableFeedback
						enableAnnouncements={false}
					/>
				</div>
			)}
		</header>
	);
}

export default AppHeader;
