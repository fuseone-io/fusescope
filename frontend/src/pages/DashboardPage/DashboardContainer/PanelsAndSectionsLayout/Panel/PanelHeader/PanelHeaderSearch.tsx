import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Input } from '@signozhq/ui/input';
import { Search, X } from '@signozhq/icons';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button as UIButton } from 'components/ui/button';
import logEvent from 'api/common/logEvent';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';

import styles from './PanelHeaderSearch.module.scss';
import { Button } from '@signozhq/ui/button';

interface PanelHeaderSearchProps {
	/** Current filter term, owned by the panel shell. */
	value: string;
	/** Pushes the new term up; the renderer applies the filter. */
	onChange: (value: string) => void;
}

/**
 * Collapsible header search (V1 parity): an icon that expands into an input and
 * collapses once empty and blurred. Owns only its chrome, never the term.
 */
function PanelHeaderSearch({
	value,
	onChange,
}: PanelHeaderSearchProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);

	const collapseIfEmpty = (): void => {
		if (!value) {
			setExpanded(false);
		}
	};

	const clear = (): void => {
		onChange('');
		setExpanded(false);
	};

	const handleSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
		onChange(e.target.value);
		void logEvent(DashboardDetailEvents.PanelSearched, {}, 'track', true);
	};

	if (!expanded) {
		return (
			<TitleTooltip title="Search">
				<UIButton
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={(): void => setExpanded(true)}
					data-testid="panel-header-search-trigger"
					aria-label="Search"
					className="tw:size-7 tw:text-muted-foreground"
				>
					<Search size={14} />
				</UIButton>
			</TitleTooltip>
		);
	}

	return (
		<Input
			autoFocus
			size={14}
			value={value}
			placeholder="Search…"
			containerClassName={styles.input}
			testId="panel-header-search-input"
			prefix={<Search size={14} />}
			suffix={
				<Button
					type="button"
					variant="ghost"
					color="secondary"
					size="sm"
					icon
					onClick={clear}
					testId="panel-header-search-clear"
					aria-label="Clear search"
				>
					<X size={14} />
				</Button>
			}
			onChange={handleSearchChange}
			onBlur={collapseIfEmpty}
			onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
				if (e.key === 'Escape') {
					clear();
				}
			}}
		/>
	);
}

export default PanelHeaderSearch;
