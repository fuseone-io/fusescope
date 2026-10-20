import { useEffect, useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import logEvent from 'api/common/logEvent';
import { DashboardListEvents } from 'pages/DashboardsListPage/constants/events';

import BlankDashboardPanel from './BlankDashboardPanel';
import ImportJsonPanel from './ImportJsonPanel';
import TemplatesPanel from './TemplatesPanel';

interface Props {
	open: boolean;
	onClose: () => void;
}

const TAB_TRIGGER =
	'tw:h-9 tw:flex-none tw:rounded-none tw:border-0 tw:border-b-2 tw:border-transparent tw:px-1 tw:pb-2 tw:text-[13px] tw:data-[state=active]:border-primary tw:data-[state=active]:text-foreground tw:data-[state=active]:shadow-none tw:after:hidden';

function NewDashboardModal({ open, onClose }: Props): JSX.Element {
	const [tab, setTab] = useState('blank');

	useEffect(() => {
		if (open) {
			setTab('blank');
		}
	}, [open]);

	const handleTabChange = (key: string): void => {
		setTab(key);
		void logEvent(DashboardListEvents.CreateModalTabChanged, { tab: key });
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next): void => {
				if (!next) {
					onClose();
				}
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className="tw:max-w-[640px]"
				data-testid="new-dashboard-modal"
			>
				<DialogHeader className="tw:pb-1">
					<DialogTitle className="tw:text-base">New dashboard</DialogTitle>
				</DialogHeader>
				<Tabs value={tab} onValueChange={handleTabChange} className="tw:gap-0">
					<TabsList
						variant="line"
						className="tw:h-auto tw:w-full tw:justify-start tw:gap-5 tw:rounded-none tw:border-b tw:border-border tw:px-5 tw:pb-0"
					>
						<TabsTrigger value="blank" className={TAB_TRIGGER}>
							Blank
						</TabsTrigger>
						<TabsTrigger value="template" className={TAB_TRIGGER}>
							From a template
						</TabsTrigger>
						<TabsTrigger value="import" className={TAB_TRIGGER}>
							Import JSON
						</TabsTrigger>
					</TabsList>
					<TabsContent value="blank" className="tw:px-5 tw:pb-5">
						<BlankDashboardPanel onClose={onClose} />
					</TabsContent>
					<TabsContent value="template" className="tw:px-5 tw:pb-5">
						<TemplatesPanel />
					</TabsContent>
					<TabsContent value="import" className="tw:px-5 tw:pb-5">
						<ImportJsonPanel onClose={onClose} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}

export default NewDashboardModal;
