import { Typography } from '@signozhq/ui/typography';
import { ChevronDown, ChevronRight } from '@signozhq/icons';

import FilterIcon from '../../FilterIcon';

interface CheckboxFilterHeaderProps {
	title: string;
	attributeKey?: string;
	dataType?: string;
	isOpen: boolean;
	showClearAll: boolean;
	onToggleOpen: () => void;
	onClear: () => void;
}

function CheckboxFilterHeader({
	title,
	attributeKey,
	dataType,
	isOpen,
	showClearAll,
	onToggleOpen,
	onClear,
}: CheckboxFilterHeaderProps): JSX.Element {
	return (
		<section className="filter-header-checkbox" onClick={onToggleOpen}>
			<section className="left-action">
				{isOpen ? (
					<ChevronDown size={13} cursor="pointer" />
				) : (
					<ChevronRight size={13} cursor="pointer" />
				)}
				{attributeKey && (
					<FilterIcon
						attributeKey={attributeKey}
						dataType={dataType}
						className="filter-icon"
					/>
				)}
				<Typography.Text className="title">{title}</Typography.Text>
			</section>
			<section className="right-action">
				{isOpen && showClearAll && (
					<Typography.Text
						className="clear-all"
						onClick={(e): void => {
							e.stopPropagation();
							e.preventDefault();
							onClear();
						}}
					>
						Clear All
					</Typography.Text>
				)}
			</section>
		</section>
	);
}

export default CheckboxFilterHeader;
