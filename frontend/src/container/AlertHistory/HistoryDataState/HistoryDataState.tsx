import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from 'components/ui/skeleton';
import { cn } from 'lib/utils';
import { CircleAlert } from 'lucide-react';

interface HistoryDataStateProps<T> {
	isLoading: boolean;
	isRefetching: boolean;
	isError: boolean;
	data: T | null;
	/** Placeholder while loading; a full-size skeleton by default. */
	loading?: ReactNode;
	className?: string;
	children: (data: T) => ReactNode;
}

/** `DataStateRenderer`'s states, drawn with skeletons and a muted error line. */
function HistoryDataState<T>({
	isLoading,
	isRefetching,
	isError,
	data,
	loading,
	className,
	children,
}: HistoryDataStateProps<T>): JSX.Element {
	const { t } = useTranslation('common');

	if (isLoading || isRefetching || !data) {
		return (
			<>
				{loading ?? (
					<Skeleton
						data-testid="history-loading"
						className={cn('tw:h-full tw:min-h-12 tw:w-full tw:bg-muted', className)}
					/>
				)}
			</>
		);
	}

	if (isError) {
		return (
			<div
				role="alert"
				className={cn(
					'fs-ui tw:flex tw:items-center tw:gap-2 tw:px-5 tw:py-4 tw:font-sans tw:text-[13px] tw:text-muted-foreground',
					className,
				)}
			>
				<CircleAlert aria-hidden="true" className="tw:size-4 tw:text-error" />
				{t('something_went_wrong')}
			</div>
		);
	}

	return <>{children(data)}</>;
}

export default HistoryDataState;
