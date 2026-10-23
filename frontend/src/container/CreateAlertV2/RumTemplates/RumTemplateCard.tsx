import { RUM_ALERT_COPY } from 'lib/rum/alertTemplateCopy';
import { RumAlertTemplateId } from 'lib/rum/alertTemplateTypes';
import { cn } from 'lib/utils';

interface RumTemplateCardProps {
	template: RumAlertTemplateId;
	pressed: boolean;
	onPick: (template: RumAlertTemplateId) => void;
}

function RumTemplateCard({
	template,
	pressed,
	onPick,
}: RumTemplateCardProps): JSX.Element {
	const copy = RUM_ALERT_COPY[template];
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={(): void => onPick(template)}
			data-testid={`rum-template-${template}`}
			className={cn(
				'tw:flex tw:min-w-0 tw:cursor-pointer tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:bg-surface-raised tw:px-3.5 tw:py-3 tw:text-left tw:font-sans tw:transition-colors',
				'tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:focus-visible:outline-none',
				pressed
					? 'tw:border-primary tw:bg-primary-soft'
					: 'tw:border-border tw:hover:border-border-strong tw:hover:bg-accent',
			)}
		>
			<span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
				<span className="tw:text-[13px] tw:font-medium tw:text-foreground">
					{copy.title}
				</span>
				<span className="tw:rounded tw:border tw:border-border tw:px-1.5 tw:text-[11px] tw:text-muted-foreground">
					Logs
				</span>
			</span>
			<span className="tw:text-xs tw:text-muted-foreground">
				{copy.description}
			</span>
		</button>
	);
}

export default RumTemplateCard;
