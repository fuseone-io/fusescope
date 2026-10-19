import { Button } from 'components/ui/button';
import { Funnel, Plus } from 'lucide-react';
import { useAppContext } from 'providers/App/App';

import LearnMoreLink from '../LearnMoreLink/LearnMoreLink';

interface FunnelsEmptyStateProps {
	onCreateFunnel?: () => void;
}

function FunnelsEmptyState({
	onCreateFunnel,
}: FunnelsEmptyStateProps): JSX.Element {
	const { hasEditPermission } = useAppContext();

	return (
		<section
			aria-label="No funnels"
			data-testid="funnels-empty"
			className="fs-ui tw:flex tw:flex-col tw:items-center tw:rounded-lg tw:border tw:border-border tw:bg-surface-raised tw:px-6 tw:py-12 tw:font-sans tw:text-foreground"
		>
			<div className="tw:flex tw:max-w-[420px] tw:flex-col tw:gap-4">
				<div className="tw:flex tw:flex-col tw:gap-2.5">
					<span
						aria-hidden="true"
						className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-primary-soft tw:text-primary-ink"
					>
						<Funnel className="tw:size-5" />
					</span>
					<p className="tw:m-0 tw:text-sm">
						<span className="tw:font-semibold">No funnels yet. </span>
						<span className="tw:text-muted-foreground">
							Create a funnel to start analyzing your data
						</span>
					</p>
				</div>
				<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
					{hasEditPermission && (
						<Button type="button" size="sm" onClick={onCreateFunnel}>
							<Plus />
							New funnel
						</Button>
					)}
					<LearnMoreLink />
				</div>
			</div>
		</section>
	);
}

export default FunnelsEmptyState;
