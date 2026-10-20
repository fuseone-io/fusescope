import { useCallback } from 'react';
import { Dependency } from 'lib/apm/dependencies';
import { ServiceKind } from 'lib/apm/serviceKind';
import { useServiceKinds } from 'lib/apm/useServiceKinds';

/** A dependency's type icon, as the services list shows it. */
export function useDependencyKind(): (dependency: Dependency) => ServiceKind {
	const identify = useServiceKinds();
	return useCallback(
		(dependency: Dependency): ServiceKind =>
			identify(dependency.name, {
				databasePeer: dependency.kind === 'Database' || undefined,
				externalOnly: dependency.kind === 'External' || undefined,
			}).kind,
		[identify],
	);
}
