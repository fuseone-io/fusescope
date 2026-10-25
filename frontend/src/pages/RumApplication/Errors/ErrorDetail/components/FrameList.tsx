import { FrameGroup } from 'lib/rum/stackFrames';

import AppFrame from './AppFrame';
import LibraryFrames from './LibraryFrames';

interface FrameListProps {
	groups: FrameGroup[];
	label: string;
	/** The group whose source shows until toggled. */
	openKey?: string;
}

function FrameList({ groups, label, openKey }: FrameListProps): JSX.Element {
	return (
		<ol
			aria-label={label}
			className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0"
		>
			{groups.map((group) =>
				group.kind === 'app' ? (
					<AppFrame
						key={group.key}
						frame={group.frame}
						initiallyOpen={group.key === openKey}
					/>
				) : (
					<LibraryFrames key={group.key} frames={group.frames} label={group.label} />
				),
			)}
		</ol>
	);
}

export default FrameList;
