import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface WidgetLinkProps {
	to: string;
	label: string;
	onClick: () => void;
}

/** "All …" link in a Home widget's header. */
function WidgetLink({ to, label, onClick }: WidgetLinkProps): JSX.Element {
	return (
		<Link
			to={to}
			onClick={onClick}
			className="tw:inline-flex tw:items-center tw:gap-1 tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-primary! tw:hover:underline"
		>
			{label}
			<ArrowRight className="tw:size-3.5" aria-hidden="true" />
		</Link>
	);
}

export default WidgetLink;
