import Panel from 'components/PageTemplate/components/Panel';
import { Skeleton } from 'components/ui/skeleton';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

function RolesListingSkeleton(): JSX.Element {
	return (
		<Panel
			testId="roles-loading"
			bodyClassName="fs-ui tw:flex tw:flex-col tw:gap-3 tw:p-5"
		>
			{ROWS.map((row) => (
				<Skeleton key={row} className="tw:h-5 tw:bg-muted" />
			))}
		</Panel>
	);
}

export default RolesListingSkeleton;
