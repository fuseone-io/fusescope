import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Kbd, KbdGroup } from 'components/ui/kbd';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';

import { ALL_SHORTCUTS, generateTableData } from './utils';

function Shortcuts(): JSX.Element {
	return (
		<SettingsPageShell
			testId="keyboard-shortcuts"
			title="Keyboard Shortcuts"
			narrow
		>
			{Object.keys(ALL_SHORTCUTS).map((section) => (
				<ContentPanel key={section} title={section} divided>
					<Table className="tw:table-fixed">
						<TableHeader className="tw:bg-surface-sunken">
							<TableRow>
								<TableHead className="tw:w-[30%]">Keyboard Shortcut</TableHead>
								<TableHead>Description</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{generateTableData(section).map((row) => (
								<TableRow key={row.key}>
									<TableCell>
										<KbdGroup aria-label={row.shortcutKey}>
											{row.shortcutKey.split('+').map((key) => (
												<Kbd key={key} className="tw:font-mono tw:uppercase">
													{key}
												</Kbd>
											))}
										</KbdGroup>
									</TableCell>
									<TableCell className="tw:whitespace-normal tw:text-muted-foreground">
										{row.shortcutDescription}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</ContentPanel>
			))}
		</SettingsPageShell>
	);
}

export default Shortcuts;
