import { cn } from 'lib/utils';

interface DataSourceOptionProps {
	label: string;
	imgUrl?: string;
	selected: boolean;
	shape?: 'tile' | 'pill';
	onClick: () => void;
}

function DataSourceOption({
	label,
	imgUrl,
	selected,
	shape = 'tile',
	onClick,
}: DataSourceOptionProps): JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={selected}
			title={label}
			onClick={onClick}
			className={cn(
				'tw:flex tw:min-w-0 tw:cursor-pointer tw:items-center tw:gap-2.5 tw:border tw:text-left tw:text-sm tw:transition-colors tw:outline-none tw:hover:border-primary tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50',
				shape === 'tile'
					? 'tw:h-11 tw:rounded-md tw:px-3'
					: 'tw:h-10 tw:rounded-full tw:px-4',
				selected
					? 'tw:border-primary tw:bg-primary-soft tw:font-medium tw:text-primary-ink'
					: 'tw:border-border tw:bg-surface-raised tw:text-foreground',
			)}
		>
			{imgUrl && (
				<img
					src={imgUrl}
					alt=""
					className="tw:size-5 tw:shrink-0 tw:object-contain"
				/>
			)}
			<span className="tw:truncate">{label}</span>
		</button>
	);
}

export default DataSourceOption;
