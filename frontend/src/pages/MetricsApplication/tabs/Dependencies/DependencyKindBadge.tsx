import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { StatusTone } from 'components/PageTemplate/types';
import { DependencyKind } from 'lib/apm/dependencies';

const TONE: Record<DependencyKind, StatusTone> = {
	Service: 'info',
	Database: 'warning',
	External: 'neutral',
};

function DependencyKindBadge({ kind }: { kind: DependencyKind }): JSX.Element {
	return <StatusBadge tone={TONE[kind]}>{kind}</StatusBadge>;
}

export default DependencyKindBadge;
