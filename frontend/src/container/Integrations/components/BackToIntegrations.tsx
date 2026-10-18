import { useHistory } from 'react-router-dom';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { ArrowLeft } from 'lucide-react';

function BackToIntegrations(): JSX.Element {
	const history = useHistory();

	return (
		<div className="fs-ui tw:-mb-2 tw:font-sans">
			<Button
				variant="ghost"
				size="sm"
				className="tw:-ml-2 tw:text-muted-foreground! tw:hover:bg-muted! tw:hover:text-foreground!"
				onClick={(): void => {
					history.push(ROUTES.INTEGRATIONS);
				}}
			>
				<ArrowLeft aria-hidden="true" />
				All Integrations
			</Button>
		</div>
	);
}

export default BackToIntegrations;
