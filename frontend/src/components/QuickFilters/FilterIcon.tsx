import { getFilterIcon } from './filterIcons';

interface FilterIconProps {
	attributeKey: string;
	dataType?: string;
	className?: string;
}

function FilterIcon({
	attributeKey,
	dataType,
	className,
}: FilterIconProps): JSX.Element {
	const Icon = getFilterIcon(attributeKey, dataType);
	return (
		<Icon
			size={16}
			strokeWidth={1.5}
			aria-hidden="true"
			data-testid={`filter-icon-${attributeKey}`}
			className={className}
		/>
	);
}

FilterIcon.defaultProps = {
	dataType: undefined,
	className: undefined,
};

export default FilterIcon;
