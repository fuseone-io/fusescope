import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { SelectProps } from 'antd/lib';
import logEvent from 'api/common/logEvent';
import { useListAccounts } from 'api/generated/services/cloudintegration';
import { getAccountById } from 'container/Integrations/CloudIntegration/utils';
import {
	CloudAccount as IntegrationCloudAccount,
	IntegrationType,
} from 'container/Integrations/types';
import useUrlQuery from 'hooks/useUrlQuery';

import AzureCloudAccountSetupModal from '../../AzureCloudServices/AddNewAccount/CloudAccountSetupModal';
import AzureAccountSettingsModal from '../../AzureCloudServices/EditAccount/AccountSettingsModal';
import GcpCloudAccountSetupDrawer from '../../GoogleCloudPlatform/AddNewAccount/CloudAccountSetupDrawer';
import GcpAccountSettingsDrawer from '../../GoogleCloudPlatform/EditAccount/AccountSettingsDrawer';
import {
	mapAccountDtoToAwsCloudAccount,
	mapAccountDtoToAzureCloudAccount,
	mapAccountDtoToGcpCloudAccount,
} from '../../mapCloudAccountFromDto';
import AwsCloudAccountSetupModal from '../AddNewAccount/CloudAccountSetupModal';
import AwsAccountSettingsModal from '../EditAccount/AccountSettingsModal';
import { CloudAccount as AwsCloudAccount } from '../types';
import AccountActionsRenderer from './AccountActionsRenderer';

import './AccountActions.style.scss';

function AccountActions({ type }: { type: IntegrationType }): JSX.Element {
	const urlQuery = useUrlQuery();
	const navigate = useNavigate();

	const { data: listAccountsResponse, isLoading } = useListAccounts({
		cloudProvider: type,
	});

	const accounts = useMemo((): IntegrationCloudAccount[] | undefined => {
		const raw = listAccountsResponse?.data?.accounts;

		if (!raw) {
			return undefined;
		}

		const mappedAccounts: IntegrationCloudAccount[] = [];

		if (type === IntegrationType.AWS_SERVICES) {
			raw.forEach((account) => {
				if (!account) {
					return;
				}
				const mapped = mapAccountDtoToAwsCloudAccount(account);
				if (mapped) {
					mappedAccounts.push(mapped);
				}
			});
		}

		if (type === IntegrationType.AZURE_SERVICES) {
			raw.forEach((account) => {
				if (!account) {
					return;
				}
				const mapped = mapAccountDtoToAzureCloudAccount(account);
				if (mapped) {
					mappedAccounts.push(mapped);
				}
			});
		}

		if (type === IntegrationType.GCP_SERVICES) {
			raw.forEach((account) => {
				if (!account) {
					return;
				}
				const mapped = mapAccountDtoToGcpCloudAccount(account);
				if (mapped) {
					mappedAccounts.push(mapped);
				}
			});
		}

		return mappedAccounts;
	}, [listAccountsResponse, type]);

	const initialAccount = useMemo(
		() =>
			accounts?.length
				? getAccountById(accounts, urlQuery.get('cloudAccountId') || '') ||
					accounts[0]
				: null,
		[accounts, urlQuery],
	);

	const [activeAccount, setActiveAccount] =
		useState<IntegrationCloudAccount | null>(initialAccount);

	// Update state when initial value changes
	useEffect(() => {
		if (initialAccount !== null) {
			setActiveAccount(initialAccount);
			const latestUrlQuery = new URLSearchParams(window.location.search);
			latestUrlQuery.set('cloudAccountId', initialAccount.cloud_account_id);
			navigate({ search: latestUrlQuery.toString() });
			return;
		}

		setActiveAccount(null);
		const latestUrlQuery = new URLSearchParams(window.location.search);
		latestUrlQuery.delete('cloudAccountId');
		navigate({ search: latestUrlQuery.toString() });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialAccount]);

	const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);

	const startAccountConnectionAttempt = (): void => {
		setIsIntegrationModalOpen(true);
		logEvent(`${type} Integration: Account connection attempt started`, {});
	};

	const [isAccountSettingsModalOpen, setIsAccountSettingsModalOpen] =
		useState(false);
	const openAccountSettings = (): void => {
		setIsAccountSettingsModalOpen(true);
		logEvent(`${type} Integration: Account settings viewed`, {
			cloudAccountId: activeAccount?.cloud_account_id,
		});
	};

	// log telemetry event when an account is viewed.
	useEffect(() => {
		if (activeAccount) {
			const { config } = activeAccount;
			let enabledRegions: string[];
			if ('regions' in config) {
				// AWS
				enabledRegions = config.regions;
			} else if ('resource_groups' in config) {
				// Azure
				enabledRegions = config.resource_groups;
			} else {
				// GCP
				enabledRegions = config.project_ids;
			}

			logEvent(`${type} Integration: Account viewed`, {
				cloudAccountId: activeAccount?.cloud_account_id,
				status: activeAccount?.status,
				enabledRegions,
			});
		}
	}, [activeAccount, type]);

	const selectOptions: SelectProps['options'] = useMemo(
		() =>
			accounts?.length
				? accounts.map((account) => ({
						value: account.cloud_account_id,
						label: account.providerAccountId,
					}))
				: [],
		[accounts],
	);

	return (
		<div className="hero-section__actions tw:flex tw:flex-wrap tw:items-center tw:gap-2">
			<AccountActionsRenderer
				type={type}
				accounts={accounts}
				isLoading={isLoading}
				activeAccount={activeAccount}
				selectOptions={selectOptions}
				onAccountChange={(value): void => {
					if (accounts) {
						setActiveAccount(getAccountById(accounts, value));
						urlQuery.set('cloudAccountId', value);
						navigate({ search: urlQuery.toString() });
					}
				}}
				onIntegrationModalOpen={startAccountConnectionAttempt}
				onAccountSettingsModalOpen={openAccountSettings}
			/>

			{isIntegrationModalOpen && (
				<>
					{type === IntegrationType.AWS_SERVICES && (
						<AwsCloudAccountSetupModal
							onClose={(): void => setIsIntegrationModalOpen(false)}
						/>
					)}
					{type === IntegrationType.AZURE_SERVICES && (
						<AzureCloudAccountSetupModal
							onClose={(): void => setIsIntegrationModalOpen(false)}
						/>
					)}
					{type === IntegrationType.GCP_SERVICES && (
						<GcpCloudAccountSetupDrawer
							onClose={(): void => setIsIntegrationModalOpen(false)}
						/>
					)}
				</>
			)}

			{isAccountSettingsModalOpen && activeAccount && (
				<>
					{type === IntegrationType.AWS_SERVICES && (
						<AwsAccountSettingsModal
							onClose={(): void => setIsAccountSettingsModalOpen(false)}
							account={activeAccount as AwsCloudAccount}
							setActiveAccount={
								setActiveAccount as Dispatch<SetStateAction<AwsCloudAccount | null>>
							}
						/>
					)}
					{type === IntegrationType.AZURE_SERVICES && (
						<AzureAccountSettingsModal
							onClose={(): void => setIsAccountSettingsModalOpen(false)}
							account={activeAccount}
							setActiveAccount={setActiveAccount}
						/>
					)}
					{type === IntegrationType.GCP_SERVICES && (
						<GcpAccountSettingsDrawer
							onClose={(): void => setIsAccountSettingsModalOpen(false)}
							account={activeAccount}
							setActiveAccount={setActiveAccount}
						/>
					)}
				</>
			)}
		</div>
	);
}

export default AccountActions;
