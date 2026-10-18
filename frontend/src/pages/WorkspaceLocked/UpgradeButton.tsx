import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { SubscriptionCreatePermission } from 'lib/authz/hooks/useAuthZ/permissions/subscription.permissions';
import { LoaderCircle } from 'lucide-react';

interface UpgradeButtonProps {
	isLoading: boolean;
	onClick: () => void;
	children: ReactNode;
}

function UpgradeButton({
	isLoading,
	onClick,
	children,
}: UpgradeButtonProps): JSX.Element {
	return (
		<AuthZTooltip checks={[SubscriptionCreatePermission]} withPortal={false}>
			<Button disabled={isLoading} onClick={onClick}>
				{isLoading && <LoaderCircle className="tw:animate-spin" />}
				<span className="translate-safe">{children}</span>
			</Button>
		</AuthZTooltip>
	);
}

export default UpgradeButton;
