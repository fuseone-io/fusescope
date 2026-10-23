import StatusBadge from 'components/PageTemplate/components/StatusBadge';

import { SheetTabItem } from './SheetTabBar';
import StepNumber from './StepNumber';

interface SheetTabsInput {
	isNew: boolean;
	created: boolean;
	rotating: boolean;
}

export function sheetTabs({
	isNew,
	created,
	rotating,
}: SheetTabsInput): SheetTabItem[] {
	if (isNew) {
		return [
			{
				value: 'settings',
				label: (
					<>
						<StepNumber>1</StepNumber>Settings
					</>
				),
			},
			{
				value: 'install',
				label: (
					<>
						<StepNumber>2</StepNumber>Install
					</>
				),
				disabled: !created,
				title: created ? undefined : 'Create the application first',
			},
		];
	}
	return [
		{ value: 'settings', label: 'Settings' },
		{
			value: 'key',
			label: (
				<>
					Public key
					{rotating && <StatusBadge tone="warning">Rotating</StatusBadge>}
				</>
			),
		},
		{ value: 'install', label: 'Install' },
		{ value: 'sourcemaps', label: 'Source maps' },
	];
}
