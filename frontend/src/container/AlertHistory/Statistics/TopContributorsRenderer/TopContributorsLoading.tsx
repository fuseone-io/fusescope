import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';

const ROWS = ['first', 'second', 'third'];

function TopContributorsLoading(): JSX.Element {
	return (
		<ContentPanel title="Top contributors" divided>
			<div className="tw:flex tw:flex-col tw:gap-4 tw:px-5 tw:py-4">
				{ROWS.map((row) => (
					<Skeleton
						key={row}
						data-testid="top-contributors-loading"
						className="tw:h-5 tw:w-full tw:bg-muted"
					/>
				))}
			</div>
		</ContentPanel>
	);
}

export default TopContributorsLoading;
