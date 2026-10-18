import StatusBadge from 'components/PageTemplate/components/StatusBadge';

interface Props {
	label: string;
	count: number;
	isModified: boolean;
}

function CommandHeader({ label, count, isModified }: Props): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:min-w-0 tw:items-center tw:gap-2.5 tw:font-sans">
			<h2
				data-testid="dashboards-view-title"
				className="tw:min-w-0 tw:truncate tw:text-base tw:font-semibold tw:text-foreground"
			>
				{label}
			</h2>
			{isModified && (
				<span
					title="Unsaved changes"
					className="tw:size-1.5 tw:flex-none tw:rounded-full tw:bg-warning"
				/>
			)}
			<StatusBadge tone="neutral" testId="dashboards-count">
				{count}
			</StatusBadge>
		</div>
	);
}

export default CommandHeader;
