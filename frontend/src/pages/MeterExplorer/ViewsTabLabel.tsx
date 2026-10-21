import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
import { useGetAllViews } from 'hooks/saveViews/useGetAllViews';

/** "Views" with how many meter views are saved. */
function ViewsTabLabel(): JSX.Element {
	const { data } = useGetAllViews('meter');
	return (
		<>
			Views
			<TabCountBadge count={data?.data?.data?.length} />
		</>
	);
}

export default ViewsTabLabel;
