interface InfoItem {
	title: string;
	description: string;
	id: string; // Add a unique identifier
}

interface InfoBlocksProps {
	items: InfoItem[];
}

function InfoBlocks({ items }: InfoBlocksProps): JSX.Element {
	return (
		<div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] tw:gap-4">
			{items.map((item) => (
				<div
					key={item.id}
					className="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-border tw:bg-background tw:p-4"
				>
					<h3 className="tw:text-sm tw:font-semibold">{item.title}</h3>
					<p className="tw:text-[13px] tw:leading-relaxed tw:text-muted-foreground">
						{item.description}
					</p>
				</div>
			))}
		</div>
	);
}

export default InfoBlocks;
