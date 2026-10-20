import { useId } from 'react';
import { Switch } from 'components/ui/switch';
import ResourceAttributesFilter from 'container/ResourceAttributesFilter';

interface ServiceToolbarProps {
	/** Shown on tabs that draw the previous period. */
	compare?: { value: boolean; onChange: (value: boolean) => void };
}

/** The environment and resource filter every tab reads, and the comparison switch. */
function ServiceToolbar({ compare }: ServiceToolbarProps): JSX.Element {
	const switchId = useId();
	return (
		<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2">
			<div className="tw:min-w-0 tw:flex-[1_1_420px]">
				<ResourceAttributesFilter />
			</div>
			{compare && (
				<span className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans">
					<Switch
						id={switchId}
						checked={compare.value}
						onCheckedChange={compare.onChange}
						data-testid="service-compare-toggle"
					/>
					<label htmlFor={switchId} className="tw:text-[13px] tw:text-foreground">
						Compare with previous period
					</label>
				</span>
			)}
		</div>
	);
}

export default ServiceToolbar;
