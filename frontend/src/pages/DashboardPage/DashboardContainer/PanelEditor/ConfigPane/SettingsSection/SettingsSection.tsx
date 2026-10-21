import { type ReactNode, useState } from 'react';
import { ChevronRight } from '@signozhq/icons';
import cx from 'classnames';

import ChangedDot from '../controls/ChangedDot/ChangedDot';

import styles from './SettingsSection.module.scss';

interface SettingsSectionProps {
	title: string;
	defaultOpen?: boolean;
	/** Controlled open state; when set, the section defers to `onOpenChange`. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	changed?: boolean;
	/** One line describing the section's settings, shown while it is collapsed. */
	summary?: string;
	/** Rendered after the toggle, at the end of the header row. */
	headerSlot?: ReactNode;
	/** Identifies the section for scrolling it into view. */
	sectionId?: string;
	children: ReactNode;
}

/**
 * Collapsible container for one configuration section in the V2 panel editor's ConfigPane.
 */
function SettingsSection({
	title,
	defaultOpen = false,
	open,
	onOpenChange,
	changed,
	summary,
	headerSlot,
	sectionId,
	children,
}: SettingsSectionProps): JSX.Element {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : internalOpen;

	const toggle = (): void => {
		const next = !isOpen;
		if (!isControlled) {
			setInternalOpen(next);
		}
		onOpenChange?.(next);
	};

	const serializedTitle = title.toLowerCase().replace(/\s+/g, '-');

	return (
		<section className={styles.section} data-section={sectionId}>
			<div className={styles.header}>
				<button
					type="button"
					className={styles.toggle}
					aria-expanded={isOpen}
					aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
					data-testid={`config-section-${serializedTitle}`}
					onClick={toggle}
				>
					<ChevronRight
						size={14}
						className={cx(styles.chevron, { [styles.open]: isOpen })}
					/>
					<span className={styles.title}>{title}</span>
					{changed && <ChangedDot title="Unsaved changes" />}
					{!isOpen && summary && (
						<span
							className={styles.summary}
							title={summary}
							data-testid={`config-section-summary-${serializedTitle}`}
						>
							{summary}
						</span>
					)}
				</button>
				{headerSlot}
			</div>
			{isOpen && <div className={styles.body}>{children}</div>}
		</section>
	);
}

export default SettingsSection;
