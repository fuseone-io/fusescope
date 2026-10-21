import TagChip from 'components/PageTemplate/components/TagChip';
import type { DefaultOptionType } from 'antd/es/select';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';

interface AlertRuleTagsProps {
	selectedTags: DefaultOptionType | DefaultOptionType[];
	closable: boolean;
	handleClose?: (removedTag: DefaultOptionType['value']) => void;
	classname?: string;
}

export function AlertRuleTags(props: AlertRuleTagsProps): JSX.Element {
	const { closable, selectedTags, handleClose, classname } = props;
	const tags = Array.isArray(selectedTags) ? selectedTags : [selectedTags];

	return (
		<div
			className={cn(
				'fs-ui tw:flex tw:flex-wrap tw:gap-1.5 tw:font-sans',
				closable && 'tw:mb-2 tw:max-h-[100px] tw:overflow-auto',
				classname,
			)}
		>
			{tags.map((tag) => {
				const label = (tag?.label as string | undefined) ?? '';

				if (!closable) {
					return (
						<TagChip key={String(tag.value)} title={label} className="tw:max-w-44">
							{label}
						</TagChip>
					);
				}

				return (
					<span
						key={String(tag.value)}
						className="tw:inline-flex tw:h-6 tw:max-w-[220px] tw:items-center tw:gap-1 tw:rounded-sm tw:border tw:border-border tw:bg-surface-sunken tw:pr-0.5 tw:pl-2 tw:text-xs tw:text-foreground"
					>
						<span className="tw:min-w-0 tw:truncate" title={label}>
							{label}
						</span>
						<button
							type="button"
							aria-label={`Remove ${label}`}
							onClick={(): void => handleClose?.(tag.value)}
							className="tw:flex tw:size-5 tw:flex-none tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0 tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:outline-none"
						>
							<X className="tw:size-3" aria-hidden="true" />
						</button>
					</span>
				);
			})}
		</div>
	);
}
