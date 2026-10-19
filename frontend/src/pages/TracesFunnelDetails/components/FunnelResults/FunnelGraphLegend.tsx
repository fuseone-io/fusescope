import { Color } from '@signozhq/design-tokens';

// The bar colours useFunnelGraph paints the chart with.
const ITEMS = [
	{ label: 'Total spans', color: Color.BG_ROBIN_500 },
	{ label: 'Error spans', color: Color.BG_CHERRY_500 },
];

function FunnelGraphLegend(): JSX.Element {
	return (
		<span className="tw:flex tw:gap-3 tw:text-xs tw:text-muted-foreground">
			{ITEMS.map((item) => (
				<span
					key={item.label}
					className="tw:inline-flex tw:items-center tw:gap-1.5"
				>
					<span
						aria-hidden="true"
						className="tw:size-1.5 tw:rounded-full"
						style={{ backgroundColor: item.color }}
					/>
					{item.label}
				</span>
			))}
		</span>
	);
}

export default FunnelGraphLegend;
