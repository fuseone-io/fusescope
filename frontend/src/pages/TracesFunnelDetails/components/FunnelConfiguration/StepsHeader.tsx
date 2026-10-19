import DateTimeSelectionV2 from 'container/TopNav/DateTimeSelectionV2';

import './StepsHeader.styles.scss';

function StepsHeader(): JSX.Element {
	return (
		<div className="tw:flex tw:items-center tw:justify-between tw:gap-3">
			<span className="fs-ui tw:flex-none tw:font-sans tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
				Funnel steps
			</span>
			<div className="funnel-steps-time-picker">
				<DateTimeSelectionV2
					showAutoRefresh={false}
					showRefreshText={false}
					hideShareModal
					showRecentlyUsed={false}
				/>
			</div>
		</div>
	);
}

export default StepsHeader;
