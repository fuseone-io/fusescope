import TagChip from 'components/PageTemplate/components/TagChip';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';

import styles from './DashboardRowTags.module.scss';

const MAX_VISIBLE_TAGS = 3;

interface DashboardRowTagsProps {
	tags: string[];
}

/**
 * The dashboards-list row tag chips: the first few inline, the rest revealed on
 * hover of a "+N" chip.
 */
function DashboardRowTags({ tags }: DashboardRowTagsProps): JSX.Element | null {
	if (tags.length === 0) {
		return null;
	}

	const extra = tags.slice(MAX_VISIBLE_TAGS);

	return (
		<div className={styles.tags}>
			{tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
				<TagChip key={tag} title={tag}>
					{tag}
				</TagChip>
			))}
			{extra.length > 0 && (
				<TitleTooltip
					side="bottom"
					title={
						<div className={styles.extraTags}>
							{extra.map((tag) => (
								<span key={tag}>{tag}</span>
							))}
						</div>
					}
				>
					{/* Stop the click so hovering/clicking the chip doesn't navigate the row. */}
					<span role="presentation" onClick={(e): void => e.stopPropagation()}>
						<TagChip>+{extra.length}</TagChip>
					</span>
				</TitleTooltip>
			)}
		</div>
	);
}

export default DashboardRowTags;
