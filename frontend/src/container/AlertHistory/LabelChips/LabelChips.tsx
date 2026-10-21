import TagChip from 'components/PageTemplate/components/TagChip';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';

interface LabelChipsProps {
	labels: Record<string, unknown>;
	/** Chips shown before the rest fold into a `+N` chip. */
	maxVisible?: number;
	testId?: string;
}

function LabelChips({
	labels,
	maxVisible = 3,
	testId,
}: LabelChipsProps): JSX.Element {
	const chips = Object.entries(labels).map(
		([key, value]) => `${key}:${String(value)}`,
	);
	const visible = chips.slice(0, maxVisible);
	const hidden = chips.slice(maxVisible);

	return (
		<div
			className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-1"
			data-testid={testId}
		>
			{visible.length === 0 && (
				<span className="tw:text-subtle-foreground">—</span>
			)}
			{visible.map((chip) => (
				<TagChip key={chip} title={chip}>
					{chip}
				</TagChip>
			))}
			{hidden.length > 0 && (
				<TitleTooltip
					title={
						<div className="tw:flex tw:flex-col tw:gap-0.5 tw:font-mono tw:text-[11px]">
							{hidden.map((chip) => (
								<span key={chip}>{chip}</span>
							))}
						</div>
					}
				>
					<span className="tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-muted-foreground">
						+{hidden.length}
					</span>
				</TitleTooltip>
			)}
		</div>
	);
}

export default LabelChips;
