import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { ArrowUpRight } from 'lucide-react';

import type { CatalogEntry } from '../../types';
import { catalogEntryLink } from '../../utils';
import EntryLogo from './EntryLogo';

const CARD_CLASS =
	'tw:flex tw:min-w-0 tw:flex-col tw:gap-2.5 tw:rounded-[10px] tw:border tw:border-border tw:bg-surface-raised tw:p-3.5 tw:text-foreground! tw:no-underline! tw:transition-colors tw:outline-none tw:hover:border-primary tw:focus-visible:ring-2 tw:focus-visible:ring-ring';

interface CatalogCardProps {
	entry: CatalogEntry;
	receiving: boolean;
}

function CatalogCard({ entry, receiving }: CatalogCardProps): JSX.Element {
	const link = catalogEntryLink(entry);
	const onClick = (): void => {
		void logEvent('Get Started: Source clicked', {
			source: entry.id,
			target: link.kind,
		});
	};

	const body: ReactNode = (
		<>
			<span className="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
				<EntryLogo icon={entry.icon} initials={entry.initials} />
				<span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:leading-snug">
					<span className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium">
						{entry.name}
						{link.kind === 'docs' && (
							<ArrowUpRight
								aria-label="Opens the docs"
								className="tw:size-3.5 tw:text-subtle-foreground"
							/>
						)}
					</span>
					<span className="tw:truncate tw:text-xs tw:text-subtle-foreground">
						{entry.how}
					</span>
				</span>
				{receiving && (
					<StatusBadge tone="success" dot>
						Receiving
					</StatusBadge>
				)}
			</span>
			<span className="tw:text-[13px] tw:text-muted-foreground">
				{entry.description}
			</span>
			<span className="tw:mt-auto tw:flex tw:flex-wrap tw:gap-1.5">
				{entry.signals.map((signal) => (
					<span
						key={signal}
						className="tw:inline-flex tw:h-[18px] tw:items-center tw:rounded-sm tw:border tw:border-border tw:px-1.5 tw:text-[11px] tw:font-medium tw:text-muted-foreground"
					>
						{signal}
					</span>
				))}
			</span>
		</>
	);

	if (link.kind === 'docs') {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				data-testid={`catalog-entry-${entry.id}`}
				onClick={onClick}
				className={CARD_CLASS}
			>
				{body}
			</a>
		);
	}

	return (
		<Link
			to={link.to}
			data-testid={`catalog-entry-${entry.id}`}
			onClick={onClick}
			className={CARD_CLASS}
		>
			{body}
		</Link>
	);
}

export default CatalogCard;
