import { memo, useState } from 'react';
import cx from 'classnames';
import OverlayScrollbar from 'components/OverlayScrollbar/OverlayScrollbar';
import { Button } from 'components/ui/button';
import useFunnelConfiguration from 'hooks/TracesFunnels/useFunnelConfiguration';
import { PencilLine } from 'lucide-react';
import FunnelItemPopover from 'pages/TracesFunnels/components/FunnelsList/FunnelItemPopover';
import HintTooltip from 'pages/TracesFunnels/components/HintTooltip/HintTooltip';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';
import { useAppContext } from 'providers/App/App';
import { SpanV3 } from 'types/api/trace/getTraceV3';
import { FunnelData } from 'types/api/traceFunnels';

import AddFunnelDescriptionModal from './AddFunnelDescriptionModal';
import CopyLinkButton from './CopyLinkButton';
import FunnelBreadcrumb from './FunnelBreadcrumb';
import StepsContent from './StepsContent';
import StepsFooter from './StepsFooter';
import StepsHeader from './StepsHeader';

import './FunnelConfiguration.styles.scss';

interface FunnelConfigurationProps {
	funnel: FunnelData;
	isTraceDetailsPage?: boolean;
	span?: SpanV3;
	triggerAutoSave?: boolean;
	showNotifications?: boolean;
}

function FunnelConfiguration({
	funnel,
	isTraceDetailsPage,
	span,
	triggerAutoSave,
	showNotifications,
}: FunnelConfigurationProps): JSX.Element {
	const { hasEditPermission } = useAppContext();
	const { triggerSave } = useFunnelContext();
	const { isPopoverOpen, setIsPopoverOpen, steps, isSaving } =
		useFunnelConfiguration({
			funnel,
			triggerAutoSave: triggerAutoSave || triggerSave,
			showNotifications: showNotifications || triggerSave,
		});
	const [isDescriptionModalOpen, setIsDescriptionModalOpen] =
		useState<boolean>(false);

	const handleDescriptionModalClose = (): void => {
		setIsDescriptionModalOpen(false);
	};

	let descriptionHint = 'Add funnel description';
	if (!hasEditPermission) {
		descriptionHint =
			'You need editor or admin access to edit funnel description';
	} else if (funnel?.description) {
		descriptionHint = 'Edit funnel description';
	}

	return (
		<div className="funnel-configuration">
			{!isTraceDetailsPage && (
				<div className="fs-ui tw:flex tw:min-h-12 tw:flex-none tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-border tw:pr-3 tw:pl-4 tw:font-sans">
					<FunnelBreadcrumb funnelName={funnel.funnel_name} />
					<div className="tw:flex tw:flex-none tw:items-center tw:gap-0.5">
						<HintTooltip title={descriptionHint}>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={(): void => setIsDescriptionModalOpen(true)}
								aria-label="Edit Funnel Description"
								disabled={!hasEditPermission}
								className="tw:text-muted-foreground tw:hover:text-foreground"
							>
								<PencilLine />
							</Button>
						</HintTooltip>
						<CopyLinkButton />
						<span
							aria-hidden="true"
							className="tw:mx-1 tw:h-[18px] tw:w-px tw:bg-border"
						/>
						<FunnelItemPopover
							isPopoverOpen={isPopoverOpen}
							setIsPopoverOpen={setIsPopoverOpen}
							funnel={funnel}
						/>
					</div>
				</div>
			)}
			<div
				className={cx('funnel-configuration__steps-wrapper', {
					'funnel-details-page': !isTraceDetailsPage,
				})}
			>
				<OverlayScrollbar>
					<>
						{!isTraceDetailsPage && (
							<div className="fs-ui tw:flex tw:flex-col tw:gap-0.5 tw:px-4 tw:pt-4 tw:font-sans">
								<h2 className="tw:m-0 tw:text-base tw:font-semibold tw:text-foreground">
									{funnel.funnel_name}
								</h2>
								<p className="tw:m-0 tw:text-[13px] tw:text-muted-foreground">
									{funnel?.description ?? 'No description added.'}
								</p>
							</div>
						)}
						<div className="funnel-configuration__steps">
							{!isTraceDetailsPage && <StepsHeader />}

							<StepsContent isTraceDetailsPage={isTraceDetailsPage} span={span} />
						</div>
					</>
				</OverlayScrollbar>
			</div>

			{!isTraceDetailsPage && (
				<>
					<StepsFooter stepsCount={steps.length} isSaving={isSaving || false} />
					<AddFunnelDescriptionModal
						isOpen={isDescriptionModalOpen}
						onClose={handleDescriptionModalClose}
						funnelId={funnel.funnel_id}
						funnelDescription={funnel?.description || ''}
					/>
				</>
			)}
		</div>
	);
}

FunnelConfiguration.defaultProps = {
	isTraceDetailsPage: false,
	span: undefined,
	triggerAutoSave: false,
	showNotifications: false,
};

export default memo(FunnelConfiguration);
