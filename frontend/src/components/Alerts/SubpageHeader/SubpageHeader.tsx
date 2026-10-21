import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { ArrowLeft } from 'lucide-react';

interface SubpageHeaderProps {
	title: ReactNode;
	titleMono?: boolean;
	/** Names where the back button goes, e.g. "Back to alert rules". */
	backLabel: string;
	onBack: (event: React.MouseEvent) => void;
	/** Beside the title: type or state badges, a "Change type" link. */
	badges?: ReactNode;
	actions?: ReactNode;
	/** Rows under the title, e.g. the rule name and labels fields. */
	children?: ReactNode;
	/** At the bottom of the band, flush with its border, e.g. section tabs. */
	tabs?: ReactNode;
	testId?: string;
}

/**
 * The header band of an Alerts page below the list (rule editor, rule
 * details, channel form): back button, title and actions, with optional rows
 * and tabs. Not `fs-ui` below the title row, so legacy fields keep their styles.
 */
function SubpageHeader({
	title,
	titleMono = false,
	backLabel,
	onBack,
	badges,
	actions,
	children,
	tabs,
	testId = 'alerts-subpage-header',
}: SubpageHeaderProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'tw:flex tw:flex-none tw:flex-col tw:gap-3.5 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:pt-4 tw:md:px-6',
				!tabs && 'tw:pb-4',
				tabs && 'tw:gap-2',
			)}
		>
			<div className="fs-ui tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:font-sans tw:text-foreground">
				<div className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-3">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label={backLabel}
						title={backLabel}
						onClick={onBack}
						data-testid="alerts-subpage-back"
					>
						<ArrowLeft aria-hidden="true" />
					</Button>
					<h1
						className={cn(
							'tw:min-w-0 tw:truncate tw:text-xl tw:leading-tight',
							titleMono
								? 'tw:font-mono tw:font-medium'
								: 'tw:font-semibold tw:tracking-[-0.01em]',
						)}
					>
						{title}
					</h1>
					{badges}
				</div>
				{actions && (
					<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
						{actions}
					</div>
				)}
			</div>
			{children}
			{tabs}
		</div>
	);
}

export default SubpageHeader;
