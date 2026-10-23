import { Redirect, useParams } from 'react-router-dom';
import ROUTES from 'constants/routes';

import { guideById } from '../guides/registry';
import GuideBody from './GuideBody';

/** An in-app setup guide at /get-started/:guideId. */
function Guide(): JSX.Element {
	const { guideId } = useParams<{ guideId: string }>();
	const guide = guideById(guideId);

	if (!guide) {
		return <Redirect to={ROUTES.GET_STARTED} />;
	}
	return <GuideBody key={guide.id} guide={guide} />;
}

export default Guide;
