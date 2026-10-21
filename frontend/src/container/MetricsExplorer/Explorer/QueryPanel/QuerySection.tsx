import { ReactNode, useState } from 'react';
import getLocalStorageKey from 'api/browser/localstorage/get';
import setLocalStorageKey from 'api/browser/localstorage/set';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const SECTIONS_KEY = 'metricsExplorerQuerySections';

export type SectionKind = 'aggregation' | 'functions' | 'result';

type Stored = Partial<Record<SectionKind, boolean>>;

function readStored(storageKey: string): Stored {
	try {
		const stored = JSON.parse(getLocalStorageKey(storageKey) || 'null');
		return stored && typeof stored === 'object' ? stored : {};
	} catch {
		return {};
	}
}

function remember(storageKey: string, kind: SectionKind, open: boolean): void {
	try {
		setLocalStorageKey(
			storageKey,
			JSON.stringify({ ...readStored(storageKey), [kind]: open }),
		);
	} catch {
		// A convenience only; blocked storage keeps the in-memory state.
	}
}

interface QuerySectionProps {
	name: string;
	kind: SectionKind;
	title: string;
	hint?: string;
	/** Shown beside the title while collapsed. */
	summary: string;
	/** Values differ from the defaults: start open so they are not hidden. */
	isSet: boolean;
	/** Where the last toggle per kind is remembered; each page keeps its own. */
	storageKey?: string;
	children: ReactNode;
}

/**
 * An optional group of a card's fields, collapsed to a one-line summary. It
 * opens with the card when it holds set values, otherwise as last toggled for
 * its kind.
 */
function QuerySection({
	name,
	kind,
	title,
	hint,
	summary,
	isSet,
	storageKey = SECTIONS_KEY,
	children,
}: QuerySectionProps): JSX.Element {
	const [isOpen, setIsOpen] = useState(
		() => isSet || readStored(storageKey)[kind] === true,
	);
	const bodyId = `qp-section-${name}-${kind}`;

	const toggle = (): void => {
		setIsOpen((open) => {
			remember(storageKey, kind, !open);
			return !open;
		});
	};

	return (
		<div className="qsec qp-section">
			<button
				type="button"
				className="esec qp-section-toggle"
				aria-expanded={isOpen}
				aria-controls={bodyId}
				data-testid={`query-section-${name}-${kind}`}
				onClick={toggle}
			>
				{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				<span>{title}</span>
				{isOpen && hint && <span className="fhint">{hint}</span>}
				{!isOpen && <span className="qp-section-sum">{summary}</span>}
			</button>
			{/* Kept mounted: the fields keep the builder's derived state in step. */}
			<div id={bodyId} className="qp-section-body" hidden={!isOpen}>
				{children}
			</div>
		</div>
	);
}

export default QuerySection;
