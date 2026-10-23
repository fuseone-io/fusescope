import { useId } from 'react';
import { Link } from 'react-router-dom';

import type { CatalogSection } from '../../types';
import CatalogCard from '../CatalogCard/CatalogCard';
import SectionHeading from './SectionHeading';
import { SECTION_ICONS } from './sectionIcons';

interface CatalogSectionViewProps {
	section: CatalogSection;
	receivingIntegrations: Set<string>;
}

function CatalogSectionView({
	section,
	receivingIntegrations,
}: CatalogSectionViewProps): JSX.Element {
	const headingId = useId();
	const Icon = SECTION_ICONS[section.id];

	return (
		<section
			aria-labelledby={headingId}
			data-testid={`catalog-section-${section.id}`}
			className="tw:flex tw:flex-col tw:gap-3"
		>
			<SectionHeading
				id={headingId}
				icon={<Icon />}
				title={section.title}
				subtitle={section.subtitle}
				action={
					section.more && (
						<Link
							to={section.more.route}
							className="tw:text-[13px] tw:font-medium tw:text-primary!"
						>
							{section.more.label}
						</Link>
					)
				}
			/>
			<div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] tw:gap-2.5">
				{section.entries.map((entry) => (
					<CatalogCard
						key={entry.id}
						entry={entry}
						receiving={Boolean(
							entry.integrationId && receivingIntegrations.has(entry.integrationId),
						)}
					/>
				))}
			</div>
		</section>
	);
}

export default CatalogSectionView;
