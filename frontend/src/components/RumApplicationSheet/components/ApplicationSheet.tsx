import SideSheet from 'components/PageTemplate/components/SideSheet';
import { useCanManageRum } from 'lib/rum/useCanManageRum';
import { cn } from 'lib/utils';
import { AppWindow } from 'lucide-react';

import { useApplicationSheet } from '../hooks/useApplicationSheet';
import { useSheetActions } from '../hooks/useSheetActions';
import { SheetTab, SheetTarget } from '../types';
import { isRotating } from '../utils/keys';
import SheetBody from './SheetBody';
import SheetSubtitle from './SheetSubtitle';
import SheetTabBar from './SheetTabBar';
import { sheetTabs } from './sheetTabs';

interface ApplicationSheetProps {
	target: SheetTarget;
	initialTab?: SheetTab;
	onClose: () => void;
	onDeleted?: () => void;
}

const WIDTH = 760;

function ApplicationSheet({
	target,
	initialTab,
	onClose,
	onDeleted,
}: ApplicationSheetProps): JSX.Element {
	const sheet = useApplicationSheet(target, initialTab);
	const actions = useSheetActions(sheet, onClose, onDeleted);
	const readOnly = !useCanManageRum();
	const { application, isNew } = sheet;
	const title = isNew ? 'New application' : (application?.name ?? 'Application');

	return (
		<SideSheet
			open
			onClose={onClose}
			width={WIDTH}
			testId="rum-application-sheet"
			title={
				<span className="tw:flex tw:items-center tw:gap-2.5">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
					>
						<AppWindow className="tw:size-4" />
					</span>
					<span className={cn(!isNew && 'tw:font-mono')}>{title}</span>
				</span>
			}
			subtitle={<SheetSubtitle application={isNew ? undefined : application} />}
			toolbar={
				<SheetTabBar
					label={isNew ? 'Setup steps' : 'Application settings'}
					tabs={sheetTabs({
						isNew,
						created: Boolean(sheet.applicationId),
						rotating: isRotating(sheet.keys),
					})}
					value={sheet.tab}
					onChange={sheet.setTab}
				/>
			}
			bodyClassName="tw:flex tw:flex-col tw:overflow-hidden tw:p-0 tw:[&>*]:flex-1"
		>
			<SheetBody
				sheet={sheet}
				actions={actions}
				readOnly={readOnly}
				onClose={onClose}
			/>
		</SideSheet>
	);
}

export default ApplicationSheet;
