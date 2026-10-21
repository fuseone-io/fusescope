import { Copy } from '@signozhq/icons';
import { type BadgeColorType } from '@signozhq/ui/badge';
import { toast } from '@signozhq/ui/sonner';
import { Tooltip } from '@signozhq/ui/tooltip';
import TagChip from 'components/PageTemplate/components/TagChip';
import { useCopyToClipboard } from 'react-use';

import styles from './LabelTag.module.scss';

export interface LabelTagProps {
	label: string;
	/** Kept for callers; tags are drawn neutral like the page template's. */
	color?: BadgeColorType;
	value?: string;
	className?: string;
}

function LabelTag({ label, value, className }: LabelTagProps): JSX.Element {
	const [, copyToClipboard] = useCopyToClipboard();
	const displayText = value ? `${label}: ${value}` : label;
	const searchFormat = value ? `${label} ${value}` : label;

	const handleCopy = (e: React.MouseEvent): void => {
		e.stopPropagation();
		copyToClipboard(searchFormat);
		toast.success('Copied! Use in search to filter alerts.');
	};

	return (
		<Tooltip
			title={
				<div className={styles.tooltipContent}>
					<span>{displayText}</span>
					<button
						type="button"
						className={styles.copyButton}
						onClick={handleCopy}
						aria-label="Copy to clipboard"
					>
						<Copy size={12} />
					</button>
				</div>
			}
		>
			<span className={className}>
				<TagChip
					testId={`label-tag-${label}`}
					className="tw:max-w-full tw:min-w-0 tw:flex-initial"
				>
					{displayText}
				</TagChip>
			</span>
		</Tooltip>
	);
}

export default LabelTag;
