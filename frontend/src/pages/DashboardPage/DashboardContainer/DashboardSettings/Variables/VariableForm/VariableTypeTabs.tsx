import { ReactNode } from 'react';
import { Color } from '@signozhq/design-tokens';
import { Info } from '@signozhq/icons';
import TextToolTip from 'components/TextToolTip';
import { fuseScopeDocsUrl } from 'constants/docs';
import { cn } from 'lib/utils';
import { ClipboardType, DatabaseZap, LayoutList, Pyramid } from 'lucide-react';

import type { VariableType } from '../variableFormModel';
import { BADGE_INFO, BADGE_WARNING } from '../../components/settingsClassNames';

interface VariableTypeTabsProps {
	value: VariableType;
	onChange: (type: VariableType) => void;
	panels: Record<VariableType, ReactNode>;
}

const SMALL_BADGE = 'tw:h-4! tw:px-1.5! tw:text-[10px]!';

const TYPES: {
	type: VariableType;
	label: string;
	testId: string;
	icon: ReactNode;
	badge?: ReactNode;
}[] = [
	{
		type: 'DYNAMIC',
		label: 'Dynamic',
		testId: 'variable-type-dynamic',
		icon: <Pyramid aria-hidden="true" />,
		badge: <span className={cn(BADGE_INFO, SMALL_BADGE)}>Beta</span>,
	},
	{
		type: 'TEXT',
		label: 'Textbox',
		testId: 'variable-type-textbox',
		icon: <ClipboardType aria-hidden="true" />,
	},
	{
		type: 'CUSTOM',
		label: 'Custom',
		testId: 'variable-type-custom',
		icon: <LayoutList aria-hidden="true" />,
	},
	{
		type: 'QUERY',
		label: 'Query',
		testId: 'variable-type-query',
		icon: <DatabaseZap aria-hidden="true" />,
		badge: (
			<span className={cn(BADGE_WARNING, SMALL_BADGE)}>Not Recommended</span>
		),
	},
];

/**
 * Variable-type picker plus the active type's fields. The parent owns `value`
 * and supplies the fields for each type; only the active ones mount.
 */
function VariableTypeTabs({
	value,
	onChange,
	panels,
}: VariableTypeTabsProps): JSX.Element {
	return (
		<>
			<div className="tw:flex tw:flex-col tw:gap-1.5">
				<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-medium tw:text-foreground">
					Variable Type
					<TextToolTip
						text="Learn more about supported variable types"
						url={fuseScopeDocsUrl('/dashboards/variables/#variable-types')}
						urlText="here"
						useFilledIcon={false}
						outlinedIcon={<Info size={14} />}
					/>
				</span>
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					<div
						role="group"
						aria-label="Variable type"
						className="tw:inline-flex tw:max-w-full tw:gap-0.5 tw:overflow-x-auto tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-0.5"
					>
						{TYPES.map((option) => {
							const pressed = option.type === value;
							return (
								<button
									key={option.type}
									type="button"
									aria-pressed={pressed}
									data-testid={option.testId}
									onClick={(): void => {
										if (!pressed) {
											onChange(option.type);
										}
									}}
									className={cn(
										'tw:inline-flex tw:h-7 tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:text-xs tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:[&_svg]:size-3.5',
										pressed &&
											'tw:border-border tw:bg-surface-raised tw:text-foreground tw:shadow-xs',
									)}
								>
									{option.icon}
									{option.label}
									{option.badge}
								</button>
							);
						})}
					</div>
					<TextToolTip
						text="Query variables can be slow and brittle, so they aren't recommended. Learn why"
						url={fuseScopeDocsUrl('/dashboards/variables/#query-variables')}
						urlText="here"
						useFilledIcon={false}
						outlinedIcon={<Info size={14} color={Color.BG_AMBER_600} />}
					/>
				</div>
			</div>
			{panels[value]}
		</>
	);
}

export default VariableTypeTabs;
