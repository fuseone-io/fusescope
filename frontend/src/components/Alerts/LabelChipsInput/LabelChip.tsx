import { useTranslation } from 'react-i18next';
import { Badge } from 'components/ui/badge';
import { X } from 'lucide-react';

import { LabelChipProps } from './types';

function LabelChip({ labelKey, value, onRemove }: LabelChipProps): JSX.Element {
	const { t } = useTranslation('alerts');
	return (
		<Badge
			variant="secondary"
			data-testid={`label-pill-${labelKey}-${value}`}
			className="tw:max-w-full tw:gap-1 tw:py-0.5 tw:pr-1 tw:font-mono tw:font-normal"
		>
			<span className="tw:truncate">
				{labelKey}: {value}
			</span>
			<button
				type="button"
				aria-label={t('labels_remove', { key: labelKey })}
				onClick={(): void => onRemove(labelKey)}
				className="tw:inline-flex tw:size-4 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-muted-foreground tw:hover:bg-background tw:hover:text-foreground tw:focus-visible:outline-2 tw:focus-visible:outline-ring"
			>
				<X aria-hidden="true" className="tw:size-3" />
			</button>
		</Badge>
	);
}

export default LabelChip;
