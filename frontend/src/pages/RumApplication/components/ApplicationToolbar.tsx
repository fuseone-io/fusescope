import { Link, useLocation } from 'react-router-dom';
import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { rumErrorsUrl, rumSessionsUrl } from 'lib/rum/links';
import { ArrowLeft } from 'lucide-react';

import { ApplicationTab, ERRORS_TAB, SESSIONS_TAB } from '../constants';
import ErrorFiltersBar from '../Errors/components/ErrorFiltersBar';
import SessionFiltersBar from '../Sessions/components/SessionFiltersBar';
import { backSearch } from '../utils';
import ReleaseFilter from './ReleaseFilter';

interface ApplicationToolbarProps {
	applicationId: string;
	tab: ApplicationTab;
	/** One session's timeline or one error group is open. */
	detail?: 'session' | 'error';
	releases: string[];
	release: string;
	onReleaseChange: (release: string) => void;
	platform?: RumtypesPlatformDTO;
}

function ApplicationToolbar({
	applicationId,
	tab,
	detail,
	releases,
	release,
	onReleaseChange,
	platform,
}: ApplicationToolbarProps): JSX.Element {
	const { search } = useLocation();
	if (detail) {
		const session = detail === 'session';
		return (
			<Link
				to={
					(session ? rumSessionsUrl(applicationId) : rumErrorsUrl(applicationId)) +
					backSearch(search)
				}
				data-testid={session ? 'rum-session-back' : 'rum-error-back'}
				className="fs-ui tw:inline-flex tw:w-fit tw:items-center tw:gap-1.5 tw:font-sans tw:text-[13px] tw:font-medium tw:text-muted-foreground! tw:hover:text-foreground!"
			>
				<ArrowLeft aria-hidden="true" className="tw:size-4" />
				<span className="translate-safe">
					{session ? 'All sessions' : 'All errors'}
				</span>
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
			{tab === ERRORS_TAB && <ErrorFiltersBar platform={platform} />}
		</div>
	);
}

export default ApplicationToolbar;
