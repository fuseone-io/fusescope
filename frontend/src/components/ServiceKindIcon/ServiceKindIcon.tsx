import { ServiceKind, ServiceKindName } from 'lib/apm/serviceKind';
import { cn } from 'lib/utils';

const TONES: Record<ServiceKindName, string> = {
	web: 'tw:bg-primary-soft tw:text-primary-ink',
	rpc: 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink',
	database: 'tw:bg-warning-soft tw:text-warning-ink',
	cache: 'tw:bg-error-soft tw:text-error-ink',
	queue: 'tw:bg-success-soft tw:text-success-ink',
	external: 'tw:bg-muted tw:text-muted-foreground',
	service: 'tw:bg-surface-sunken tw:text-muted-foreground',
};

interface ServiceKindIconProps {
	kind: ServiceKind;
	size?: 'sm' | 'md';
	className?: string;
}

/** A service's type as a tinted icon tile, named by its title. */
function ServiceKindIcon({
	kind,
	size = 'sm',
	className,
}: ServiceKindIconProps): JSX.Element {
	const Icon = kind.icon;
	return (
		<span
			title={kind.label}
			data-testid="service-kind-icon"
			data-kind={kind.kind}
			className={cn(
				'tw:inline-flex tw:flex-none tw:items-center tw:justify-center',
				size === 'sm' ? 'tw:size-6 tw:rounded-md' : 'tw:size-8 tw:rounded-lg',
				TONES[kind.kind],
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={size === 'sm' ? 'tw:size-3.5' : 'tw:size-[18px]'}
			/>
			<span className="tw:sr-only">{kind.label}</span>
		</span>
	);
}

export default ServiceKindIcon;
