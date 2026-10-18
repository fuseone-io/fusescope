import { Button } from 'components/ui/button';
import { Check, Goal } from 'lucide-react';

interface RequestDataSourceProps {
	searchQuery: string;
	hasResults: boolean;
	submitted: boolean;
	onRequest: () => void;
	onRaiseRequest: () => void;
}

const SECONDARY_BUTTON =
	'tw:bg-surface-raised! tw:text-foreground! tw:hover:bg-muted!';

const SUCCESS_BUTTON =
	'tw:border-success! tw:bg-success-soft! tw:text-success-ink! tw:hover:bg-success-soft!';

function RequestDataSource({
	searchQuery,
	hasResults,
	submitted,
	onRequest,
	onRaiseRequest,
}: RequestDataSourceProps): JSX.Element | null {
	if (!hasResults && searchQuery.length === 0) {
		return null;
	}

	const requestRaised = (
		<Button variant="outline" className={SUCCESS_BUTTON}>
			<Check aria-hidden />
			Request raised
		</Button>
	);

	return (
		<div className="fs-ui tw:my-8 tw:flex tw:w-fit tw:flex-wrap tw:items-center tw:gap-4 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:bg-surface-raised tw:py-3 tw:pr-3 tw:pl-4 tw:font-sans tw:text-sm tw:text-muted-foreground">
			{hasResults ? (
				<>
					<span>Can’t find what you’re looking for?</span>
					{submitted ? (
						requestRaised
					) : (
						<Button
							variant="outline"
							className={SECONDARY_BUTTON}
							onClick={onRequest}
						>
							<Goal aria-hidden />
							Request Data Source
						</Button>
					)}
				</>
			) : (
				<>
					<span>
						Our team can help add{' '}
						<span className="tw:rounded-sm tw:bg-warning-soft tw:px-1 tw:py-0.5 tw:text-warning-ink">
							{searchQuery}
						</span>{' '}
						support for you
					</span>
					{submitted ? (
						requestRaised
					) : (
						<Button
							variant="outline"
							className={SECONDARY_BUTTON}
							onClick={onRaiseRequest}
						>
							<Goal aria-hidden />
							Raise request
						</Button>
					)}
				</>
			)}
		</div>
	);
}

export default RequestDataSource;
