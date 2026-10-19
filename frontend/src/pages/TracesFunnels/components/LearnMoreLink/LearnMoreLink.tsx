import { Button } from 'components/ui/button';
import { ArrowUpRight } from 'lucide-react';
import { openInNewTab } from 'utils/navigation';

import { FUNNELS_LEARN_MORE_URL } from '../../constants';

function LearnMoreLink(): JSX.Element {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="tw:text-primary! tw:hover:text-primary-strong!"
			onClick={(): void => openInNewTab(FUNNELS_LEARN_MORE_URL)}
		>
			Learn more
			<ArrowUpRight className="tw:size-3.5" />
		</Button>
	);
}

export default LearnMoreLink;
