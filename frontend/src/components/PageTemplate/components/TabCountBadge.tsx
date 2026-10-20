interface TabCountBadgeProps {
	count: number | undefined;
}

/** A count beside a tab label; nothing while it is unknown. */
function TabCountBadge({ count }: TabCountBadgeProps): JSX.Element | null {
	if (count === undefined) {
		return null;
	}
	return (
		<span className="tw:inline-flex tw:h-[18px] tw:items-center tw:rounded-full tw:bg-muted tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-muted-foreground tw:tabular-nums">
			{count}
		</span>
	);
}

export default TabCountBadge;
