import { Button } from 'components/ui/button';
import { Kbd } from 'components/ui/kbd';
import { Search } from 'lucide-react';
import { useCmdK } from 'providers/cmdKProvider';
import { getUserOperatingSystem, UserOperatingSystem } from 'utils/getUserOS';

import { SEARCH_LABEL } from '../constants';

/** Opens the ⌘K palette, which owns the shortcut itself. */
function SearchTrigger(): JSX.Element {
	const { openCmdK } = useCmdK();
	const shortcut =
		getUserOperatingSystem() === UserOperatingSystem.MACOS ? '⌘K' : 'Ctrl K';

	return (
		<Button
			type="button"
			variant="outline"
			data-testid="app-header-search"
			aria-label={SEARCH_LABEL}
			aria-keyshortcuts="Meta+K Control+K"
			onClick={openCmdK}
			className="tw:h-8 tw:w-8 tw:px-0 tw:font-normal tw:text-subtle-foreground tw:shadow-none tw:md:w-full tw:md:justify-between tw:md:px-3"
		>
			<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
				<Search aria-hidden className="tw:stroke-[1.5]" />
				<span className="tw:hidden tw:truncate tw:md:inline">{SEARCH_LABEL}</span>
			</span>
			<Kbd className="tw:hidden tw:font-mono tw:md:inline-flex">{shortcut}</Kbd>
		</Button>
	);
}

export default SearchTrigger;
