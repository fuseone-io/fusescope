import { ReactNode, useCallback } from 'react';
import { toast } from '@signozhq/ui/sonner';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import CopyButton from 'periscope/components/CopyButton/CopyButton';

import styles from './EntityMetadataItem.module.scss';

export interface EntityMetadataItemProps {
	label: string;
	value: string;
	/** An entity-supplied renderer, which opts out of clamping, tooltip and copy. */
	renderedValue?: ReactNode;
}

export function EntityMetadataItem({
	label,
	value,
	renderedValue,
}: EntityMetadataItemProps): JSX.Element {
	const handleCopy = useCallback((): void => {
		toast.success(`${label} copied to clipboard`, { position: 'bottom-left' });
	}, [label]);

	return (
		<div className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:font-sans">
			<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase">
				{label}
			</span>

			{renderedValue ?? (
				<div className={styles.valueRow}>
					<TitleTooltip title={value} side="bottom">
						<span className="tw:block tw:min-w-0 tw:truncate">
							<span className="tw:font-mono tw:text-[13px] tw:text-foreground">
								{value}
							</span>
						</span>
					</TitleTooltip>
					{!!value && (
						<CopyButton
							value={value}
							size={12}
							ariaLabel={`Copy ${label}`}
							testId={`copy-metadata-${label.toLowerCase().replace(/\s+/g, '-')}`}
							onCopy={handleCopy}
						/>
					)}
				</div>
			)}
		</div>
	);
}
