import { useIsMutating } from 'react-query';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { Check, Funnel, LoaderCircle } from 'lucide-react';
import { useFunnelContext } from 'pages/TracesFunnels/FunnelContext';

interface StepsFooterProps {
	stepsCount: number;
	isSaving: boolean;
}

const WARNING = 'tw:text-warning-ink tw:dark:text-warning';

function ValidTracesCount(): JSX.Element {
	const {
		hasAllEmptyStepFields,
		isValidateStepsLoading,
		hasIncompleteStepFields,
		validTracesCount,
		funnelId,
	} = useFunnelContext();

	const isFunnelUpdateMutating = useIsMutating([
		REACT_QUERY_KEY.UPDATE_FUNNEL_STEPS,
		funnelId,
	]);

	if (hasAllEmptyStepFields) {
		return <span>No service / span names</span>;
	}

	if (hasIncompleteStepFields) {
		return <span className={WARNING}>Missing service / span names</span>;
	}

	if (isValidateStepsLoading || isFunnelUpdateMutating) {
		return (
			<Skeleton
				data-testid="valid-traces-loading"
				className="tw:h-4 tw:w-24 tw:bg-muted"
			/>
		);
	}

	if (validTracesCount === 0) {
		return <span className={WARNING}>No valid traces found</span>;
	}

	return <span>Valid traces found</span>;
}

function StepsFooter({ stepsCount, isSaving }: StepsFooterProps): JSX.Element {
	const { hasIncompleteStepFields, handleSaveFunnel, hasUnsavedChanges } =
		useFunnelContext();

	return (
		<div className="steps-footer fs-ui tw:flex tw:flex-none tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-border tw:bg-surface-raised tw:px-4 tw:py-2.5 tw:font-sans">
			<span className="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-muted-foreground">
				<Funnel aria-hidden="true" className="tw:size-3.5" />
				<span className="tw:tabular-nums">{stepsCount} steps</span>
				<span aria-hidden="true">·</span>
				<ValidTracesCount />
			</span>
			<Button
				type="button"
				size="sm"
				disabled={hasIncompleteStepFields || !hasUnsavedChanges || isSaving}
				onClick={handleSaveFunnel}
				aria-busy={isSaving || undefined}
			>
				{isSaving ? <LoaderCircle className="tw:animate-spin" /> : <Check />}
				<span>Save funnel</span>
			</Button>
		</div>
	);
}

export default StepsFooter;
