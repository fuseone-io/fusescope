import {
	convertMetricKeyToTrace,
	getResourceDeploymentKeys,
} from 'hooks/useResourceAttribute/utils';
import { X } from 'lucide-react';

import ChipFrame from './ChipFrame';
import { IQueryChipProps } from './types';

function QueryChip({ queryData, onClose }: IQueryChipProps): JSX.Element {
	const key = convertMetricKeyToTrace(queryData.tagKey);
	const isClosable = queryData.tagKey !== getResourceDeploymentKeys();

	return (
		<ChipFrame>
			<span className="tw:text-muted-foreground">{key}</span>
			<span className="tw:font-semibold">{queryData.operator}</span>
			<span className="tw:truncate">{queryData.tagValue.join(', ')}</span>
			{isClosable && (
				<button
					type="button"
					aria-label={`Remove ${key} filter`}
					onMouseDown={(event): void => event.preventDefault()}
					onClick={(event): void => {
						event.stopPropagation();
						onClose(queryData.id);
					}}
					className="tw:-mr-1 tw:flex tw:cursor-pointer tw:items-center tw:rounded-sm tw:text-muted-foreground tw:hover:text-foreground"
				>
					<X className="tw:size-3" />
				</button>
			)}
		</ChipFrame>
	);
}

export default QueryChip;
