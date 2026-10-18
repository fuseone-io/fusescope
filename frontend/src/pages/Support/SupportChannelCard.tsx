import { ReactNode } from 'react';
import { Button } from 'components/ui/button';
import { ArrowUpRight } from 'lucide-react';

interface SupportChannelCardProps {
	icon: ReactNode;
	name: string;
	title: string;
	btnText: string;
	isExternal: boolean;
	onClick: () => void;
}

function SupportChannelCard({
	icon,
	name,
	title,
	btnText,
	isExternal,
	onClick,
}: SupportChannelCardProps): JSX.Element {
	return (
		<div className="support-channel tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:p-4 tw:transition-colors tw:hover:border-primary">
			<div className="tw:flex tw:items-center tw:gap-3">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-md tw:bg-primary-soft tw:text-primary-ink"
				>
					{icon}
				</span>
				<h2 className="tw:truncate tw:text-sm tw:font-semibold">{name}</h2>
			</div>
			<p className="tw:flex-1 tw:text-[13px] tw:leading-relaxed tw:text-muted-foreground">
				{title}
			</p>
			<Button
				variant="outline"
				size="sm"
				className="tw:self-start tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!"
				onClick={onClick}
			>
				{btnText}
				{isExternal && <ArrowUpRight />}
			</Button>
		</div>
	);
}

export default SupportChannelCard;
