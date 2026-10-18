import { Link } from 'react-router-dom';
import SystemPagePanel from 'components/SystemPagePanel/SystemPagePanel';
import { Button } from 'components/ui/button';
import ROUTES from 'constants/routes';
import { Compass, House } from 'lucide-react';

import { defaultText } from './constant';

function NotFound({ text = defaultText }: Props): JSX.Element {
	return (
		<SystemPagePanel
			testId="not-found"
			icon={<Compass />}
			tone="neutral"
			title="Page Not Found"
			description={text}
			actions={
				<Button
					asChild
					className="tw:bg-primary! tw:text-primary-foreground! tw:hover:bg-primary/90!"
				>
					<Link to={ROUTES.HOME}>
						<House />
						Return Home
					</Link>
				</Button>
			}
		/>
	);
}

interface Props {
	text?: string;
}

NotFound.defaultProps = {
	text: defaultText,
};

export default NotFound;
