import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Button as SignozButton } from '@signozhq/ui/button';
import { DialogWrapper } from '@signozhq/ui/dialog';
import { Input as SignozInput } from '@signozhq/ui/input';
import { toast } from '@signozhq/ui/sonner';
import logEvent from 'api/common/logEvent';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import ROUTES from 'constants/routes';
import { Check } from '@signozhq/icons';
import { ArrowRight, Cable, Plug, Search } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { routePermission } from 'utils/permission';

import './IntegrationsHeader.styles.scss';

const SEARCH_PLACEHOLDER = 'Search for an integration...';

interface IntegrationsHeaderProps {
	searchQuery: string;
	onSearchChange: (value: string) => void;
}

function IntegrationsHeader(props: IntegrationsHeaderProps): JSX.Element {
	const history = useHistory();
	const { user } = useAppContext();

	const { searchQuery, onSearchChange } = props;
	const [isRequestIntegrationDialogOpen, setIsRequestIntegrationDialogOpen] =
		useState(false);

	const [
		isSubmittingRequestForIntegration,
		setIsSubmittingRequestForIntegration,
	] = useState(false);

	const [requestedIntegrationName, setRequestedIntegrationName] = useState('');

	const isGetStartedWithCloudAllowed =
		routePermission.GET_STARTED_WITH_CLOUD.includes(user.role);

	const handleRequestIntegrationSubmit = async (): Promise<void> => {
		try {
			setIsSubmittingRequestForIntegration(true);
			const eventName = 'Integration requested';
			const screenName = 'Integration list page';

			const response = await logEvent(eventName, {
				screen: screenName,
				integration: requestedIntegrationName,
			});

			if (response.statusCode === 200) {
				toast.success('Integration Request Submitted', {
					position: 'top-right',
				});
				setRequestedIntegrationName('');
				setIsRequestIntegrationDialogOpen(false);
				setIsSubmittingRequestForIntegration(false);
			} else {
				toast.error(response.error || 'Something went wrong', {
					position: 'top-right',
				});

				setIsSubmittingRequestForIntegration(false);
			}
		} catch (error) {
			toast.error('Something went wrong', {
				position: 'top-right',
			});
			setIsSubmittingRequestForIntegration(false);
		}
	};

	return (
		<>
			<PageHeader
				icon={<Plug />}
				title="Integrations"
				description="Manage integrations for this workspace."
				actions={
					<>
						<Button
							variant="outline"
							className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
							onClick={(): void => setIsRequestIntegrationDialogOpen(true)}
						>
							<Cable aria-hidden="true" />
							Request Integration
						</Button>
						{isGetStartedWithCloudAllowed && (
							<Button
								onClick={(): void => history.push(ROUTES.GET_STARTED_WITH_CLOUD)}
							>
								View 150+ Data Sources
								<ArrowRight aria-hidden="true" />
							</Button>
						)}
					</>
				}
			/>

			<div className="fs-ui tw:relative tw:w-full tw:font-sans">
				<Search
					aria-hidden="true"
					className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3 tw:size-4 tw:-translate-y-1/2 tw:text-subtle-foreground"
				/>
				<Input
					type="search"
					aria-label={SEARCH_PLACEHOLDER}
					placeholder={SEARCH_PLACEHOLDER}
					value={searchQuery}
					onChange={(e: ChangeEvent<HTMLInputElement>): void =>
						onSearchChange(e.target.value)
					}
					className="tw:bg-surface-raised tw:pl-9 tw:dark:bg-surface-raised"
				/>
			</div>

			<DialogWrapper
				className="request-integration-dialog"
				title="Request New Integration"
				open={isRequestIntegrationDialogOpen}
				onOpenChange={setIsRequestIntegrationDialogOpen}
			>
				<div className="request-integration-form">
					<div className="request-integration-form-title">
						Which integration are you looking for?
					</div>
					<SignozInput
						placeholder="Enter integration name..."
						value={requestedIntegrationName}
						onChange={(e: ChangeEvent<HTMLInputElement>): void => {
							setRequestedIntegrationName(e.target.value);
						}}
						onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
							if (e.key === 'Enter' && requestedIntegrationName?.trim().length > 0) {
								handleRequestIntegrationSubmit();
							}
						}}
						disabled={isSubmittingRequestForIntegration}
					/>
				</div>

				<div className="request-integration-form-footer">
					<SignozButton
						disabledTooltip="Enter an integration name first"
						size="md"
						variant="solid"
						color="primary"
						prefix={<Check size={14} />}
						onClick={handleRequestIntegrationSubmit}
						loading={isSubmittingRequestForIntegration}
						disabled={
							!requestedIntegrationName ||
							requestedIntegrationName?.trim().length === 0
						}
					>
						Submit
					</SignozButton>
				</div>
			</DialogWrapper>
		</>
	);
}

export default IntegrationsHeader;
