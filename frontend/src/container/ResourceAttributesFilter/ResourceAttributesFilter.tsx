import { ReactNode, useEffect, useState } from 'react';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { IOption } from 'hooks/useResourceAttribute/types';
import {
	getEnvironmentTagKeys,
	getEnvironmentTagValues,
	getResourceDeploymentKeys,
} from 'hooks/useResourceAttribute/utils';

import AttributeCombobox from './components/AttributeCombobox/AttributeCombobox';
import EnvironmentSelect from './components/EnvironmentSelect/EnvironmentSelect';

function ResourceAttributesFilter({
	suffixIcon,
}: ResourceAttributesFilterProps): JSX.Element | null {
	const { queries, handleEnvironmentChange } = useResourceAttribute();

	const [environments, setEnvironments] = useState<IOption[]>([]);

	const resourceDeploymentKey = getResourceDeploymentKeys();

	const selectedEnvironments =
		queries.find((query) => query.tagKey === resourceDeploymentKey)?.tagValue ??
		[];

	useEffect(() => {
		getEnvironmentTagKeys().then((tagKeys) => {
			if (tagKeys && Array.isArray(tagKeys) && tagKeys.length > 0) {
				getEnvironmentTagValues().then((tagValues) => {
					setEnvironments(tagValues);
				});
			}
		});
	}, []);

	return (
		<div className="fs-ui tw:flex tw:w-full tw:flex-wrap tw:items-center tw:gap-2 tw:font-sans tw:text-foreground">
			<EnvironmentSelect
				options={environments}
				value={selectedEnvironments}
				onChange={handleEnvironmentChange}
			/>
			<AttributeCombobox suffixIcon={suffixIcon} />
		</div>
	);
}

interface ResourceAttributesFilterProps {
	suffixIcon?: ReactNode;
}

ResourceAttributesFilter.defaultProps = {
	suffixIcon: undefined,
};

export default ResourceAttributesFilter;
