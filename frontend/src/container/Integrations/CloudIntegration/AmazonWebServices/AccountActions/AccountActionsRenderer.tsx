import { Select } from 'antd';
import { SelectProps } from 'antd/lib';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import cx from 'classnames';
import {
	CloudAccount as IntegrationCloudAccount,
	IntegrationType,
} from 'container/Integrations/types';
import { ChevronDown, PencilLine, Plug, Plus } from 'lucide-react';

const SECONDARY_BUTTON_CLASS =
	'tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!';

interface AccountActionsRendererProps {
	type: IntegrationType;
	accounts: IntegrationCloudAccount[] | undefined;
	isLoading: boolean;
	activeAccount: IntegrationCloudAccount | null;
	selectOptions: SelectProps['options'];
	onAccountChange: (value: string) => void;
	onIntegrationModalOpen: () => void;
	onAccountSettingsModalOpen: () => void;
}

function AccountActionsRenderer({
	type,
	accounts,
	isLoading,
	activeAccount,
	selectOptions,
	onAccountChange,
	onIntegrationModalOpen,
	onAccountSettingsModalOpen,
}: AccountActionsRendererProps): JSX.Element {
	if (isLoading) {
		return (
			<Skeleton
				data-testid="cloud-account-actions-loading"
				className="tw:h-9 tw:w-72 tw:bg-muted"
			/>
		);
	}

	if (accounts?.length) {
		return (
			<>
				<div className="hero-section__actions-with-account-selector-container tw:flex tw:h-9 tw:items-center tw:rounded-md tw:border tw:border-border tw:bg-surface-raised tw:pl-3">
					<span
						aria-hidden="true"
						className="tw:size-2 tw:flex-none tw:rounded-full tw:bg-success"
					/>
					<span className="account-selector-label tw:pr-1 tw:pl-2 tw:text-[13px] tw:text-muted-foreground">
						Account:
					</span>
					<span className="account-selector">
						<Select
							value={activeAccount?.providerAccountId}
							options={selectOptions}
							rootClassName={cx('cloud-account-selector', {
								[type.toLowerCase()]: type,
							})}
							popupMatchSelectWidth={false}
							placeholder={`Select ${type} Account`}
							suffixIcon={<ChevronDown size={16} />}
							onChange={onAccountChange}
						/>
					</span>
				</div>
				<Button
					variant="outline"
					className={SECONDARY_BUTTON_CLASS}
					onClick={onAccountSettingsModalOpen}
				>
					<PencilLine aria-hidden="true" />
					Edit Account
				</Button>
				<Button
					variant="outline"
					className={SECONDARY_BUTTON_CLASS}
					onClick={onIntegrationModalOpen}
				>
					<Plus aria-hidden="true" />
					Add New Account
				</Button>
			</>
		);
	}

	return (
		<Button onClick={onIntegrationModalOpen}>
			<Plug aria-hidden="true" />
			Integrate Now
		</Button>
	);
}

export default AccountActionsRenderer;
