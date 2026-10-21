import { ReactNode } from 'react';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';

interface DisabledReasonProps {
	/** Why the control is unavailable; nothing renders the control alone. */
	reason?: string;
	children: ReactNode;
}

/** A disabled button gets no hover, so its reason hangs on a wrapper. */
function DisabledReason({
	reason,
	children,
}: DisabledReasonProps): JSX.Element {
	return (
		<TitleTooltip title={reason}>
			<span className="tw:inline-flex">{children}</span>
		</TitleTooltip>
	);
}

export default DisabledReason;
