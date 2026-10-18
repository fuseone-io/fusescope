import { useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { cn } from 'lib/utils';
import {
	ArrowRight,
	ArrowRightToLine,
	BookOpenText,
	Check,
} from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { LicensePlatform } from 'types/api/licensesV3/getActive';
import { USER_ROLES } from 'types/roles';
import { openInNewTab } from 'utils/navigation';

export type ChecklistItem = {
	id: string;
	title: string;
	description: string;
	completed: boolean;
	isSkipped: boolean;
	isSkippable?: boolean;
	skippedPreferenceKey?: string;
	toRoute?: string;
	docsLink?: string;
};

const SECTION_LABEL =
	'tw:px-2 tw:pb-1 tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase';

function HomeChecklist({
	checklistItems,
	onSkip,
	isLoading,
}: {
	checklistItems: ChecklistItem[];
	onSkip: (item: ChecklistItem) => void;
	isLoading: boolean;
}): JSX.Element {
	const { user, activeLicense } = useAppContext();

	const completedChecklistItems = useMemo(
		() => checklistItems.filter((item) => item.completed),
		[checklistItems],
	);
	const whatsNextChecklistItems = useMemo(
		() => checklistItems.filter((item) => !item.completed),
		[checklistItems],
	);

	const handleGetStarted = (item: ChecklistItem): void => {
		void logEvent('Welcome Checklist: Get started clicked', {
			step: item.id,
		});

		if (item.toRoute !== ROUTES.GET_STARTED_WITH_CLOUD) {
			history.push(item.toRoute || '');
		} else if (
			activeLicense &&
			activeLicense.platform === LicensePlatform.CLOUD
		) {
			history.push(item.toRoute || '');
		} else {
			openInNewTab(item.docsLink || '');
		}
	};

	return (
		<div
			data-testid="home-checklist"
			className="fs-ui tw:flex tw:flex-col tw:gap-3 tw:font-sans"
		>
			<div>
				<div className={SECTION_LABEL}>Completed</div>
				<ol className="tw:flex tw:flex-col">
					{completedChecklistItems.map((item) => (
						<li
							key={item.id}
							className="tw:flex tw:min-h-8 tw:items-center tw:gap-2.5 tw:px-2 tw:text-[13px] tw:text-muted-foreground"
						>
							<span
								aria-hidden="true"
								className="tw:flex tw:size-[18px] tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-success-soft tw:text-success-ink"
							>
								<Check className="tw:size-3" strokeWidth={2.5} />
							</span>
							{item.title}
						</li>
					))}
				</ol>
			</div>

			{whatsNextChecklistItems.length > 0 && (
				<div>
					<div className={SECTION_LABEL}>What&apos;s Next</div>
					<ol className="tw:flex tw:flex-col tw:gap-1">
						{whatsNextChecklistItems.map((item, index) => {
							const isActive = index === 0 && !item.isSkipped && !item.completed;
							// The active step stays open; the others open on hover or focus.
							const revealed = isActive
								? 'tw:flex'
								: 'tw:hidden tw:group-hover:flex tw:group-focus-within:flex';
							return (
								<li
									key={item.id}
									data-state={isActive ? 'active' : undefined}
									className={cn(
										'tw:group tw:flex tw:flex-col tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-[13px] tw:hover:bg-muted',
										isActive && 'tw:bg-muted',
										item.isSkipped && 'tw:opacity-60',
										isLoading && 'tw:pointer-events-none tw:opacity-60',
									)}
								>
									<div className="tw:flex tw:items-center tw:gap-2.5">
										<span
											aria-hidden="true"
											className={cn(
												'tw:size-[18px] tw:flex-none tw:rounded-full tw:border-[1.5px] tw:border-dashed tw:border-subtle-foreground',
												isActive && 'tw:border-solid tw:border-primary',
											)}
										/>
										<span className="tw:font-medium tw:text-foreground">
											{item.title}
										</span>
									</div>

									{item.description && (
										<p
											className={cn(
												'tw:pl-7 tw:text-xs tw:text-muted-foreground',
												revealed,
											)}
										>
											{item.description}
										</p>
									)}

									{user?.role !== USER_ROLES.VIEWER && (
										<div
											className={cn(
												'tw:flex-wrap tw:items-center tw:gap-2 tw:pl-7',
												revealed,
											)}
										>
											<Button
												variant="outline"
												size="xs"
												onClick={(): void => handleGetStarted(item)}
												className="tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
											>
												Get Started
												<ArrowRight aria-hidden="true" />
											</Button>

											{item.docsLink && (
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`${item.title} docs`}
													onClick={(): void => {
														void logEvent('Welcome Checklist: Docs clicked', {
															step: item.id,
														});

														openInNewTab(item.docsLink ?? '');
													}}
												>
													<BookOpenText aria-hidden="true" />
												</Button>
											)}

											{!item.isSkipped && item.isSkippable && (
												<Button
													variant="ghost"
													size="xs"
													disabled={isLoading}
													onClick={(): void => {
														void logEvent('Welcome Checklist: Skip clicked', {
															step: item.id,
														});
														onSkip(item);
													}}
													className="tw:text-muted-foreground"
												>
													<ArrowRightToLine aria-hidden="true" />
													Skip for now
												</Button>
											)}
										</div>
									)}
								</li>
							);
						})}
					</ol>
				</div>
			)}
		</div>
	);
}

export default HomeChecklist;
