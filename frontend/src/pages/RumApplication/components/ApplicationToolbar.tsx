import { Link, useLocation } from 'react-router-dom';
import { rumSessionsUrl } from 'lib/rum/links';
import { ArrowLeft } from 'lucide-react';

import { ApplicationTab, SESSIONS_TAB } from '../constants';
import SessionFiltersBar from '../Sessions/components/SessionFiltersBar';
import ReleaseFilter from './ReleaseFilter';

interface ApplicationToolbarProps {
	applicationId: string;
	tab: ApplicationTab;
	/** One session's timeline is open. */
	sessionView: boolean;
	releases: string[];
	release: string;
	onReleaseChange: (release: string) => void;
}

function ApplicationToolbar({
	applicationId,
	tab,
	sessionView,
	releases,
	release,
	onReleaseChange,
}: ApplicationToolbarProps): JSX.Element {
	const { search } = useLocation();
	if (sessionView) {
		return (
			<Link
				to={rumSessionsUrl(applicationId) + search}
				data-testid="rum-session-back"
				className="fs-ui tw:inline-flex tw:w-fit tw:items-center tw:gap-1.5 tw:font-sans tw:text-[13px] tw:font-medium tw:text-muted-foreground! tw:hover:text-foreground!"
			>
				<ArrowLeft aria-hidden="true" className="tw:size-4" />
				All sessions
			</Link>
		);
	}
	return (
		<div className="fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2 tw:font-sans">
			<ReleaseFilter
				releases={releases}
				value={release}
				onChange={onReleaseChange}
			/>
			{tab === SESSIONS_TAB && <SessionFiltersBar applicationId={applicationId} />}
		</div>
	);
}

export default ApplicationToolbar;
